const { sendInProgressGameUpdate, rateEloGame } = require('../util.js');
const { userList, games } = require('../models.js');
const { sendUserList, sendGameList } = require('../user-requests.js');
const Account = require('../../../models/account.js');
const Game = require('../../../models/game');
const buildEnhancedGameSummary = require('../../../models/game-summary/buildEnhancedGameSummary');
const { updateProfiles } = require('../../../models/profile/utils');
const debug = require('debug')('game:summary');
const animals = require('../../../utils/animals');
const adjectives = require('../../../utils/adjectives');
const _ = require('lodash');
const { makeReport } = require('../report.js');
const { CURRENTSEASONNUMBER } = require('../../../src/frontend-scripts/node-constants.js');
const { LineGuess } = require('../util');
const { checkBadgesELO, checkBadgesXP } = require('../badges');

const generateGameObject = game => {
	const casualBool = Boolean(game?.general?.casualGame); // Because Mongo is explicitly typed and integers are not truthy according to it
	const practiceBool = Boolean(game?.general?.practiceGame);
	const unlistedBool = Boolean(game?.general?.unlistedGame);
	const objMap = (obj, f) => new Map(Object.entries(obj || {})?.map(([k, v]) => [k, f(k, v)]));

	if (game?.gameState && game?.gameState?.isCompleted) {
		return {
			uid: game?.general?.uid,
			name: game?.general?.name,
			date: new Date(),
			guesses: objMap(game?.guesses, (_, g) => g?.toString()),
			playerChats: game?.general?.playerChats,
			chats: game?.chats?.concat(game?.private?.unSeatedGameChats)?.concat(game?.private?.replayGameChats),
			hiddenInfoChat: game?.private?.hiddenInfoChat,
			isVerifiedOnly: game?.general?.isVerifiedOnly,
			season: CURRENTSEASONNUMBER,
			winningPlayers: game?.private?.seatedPlayers
				?.filter(player => player?.wonGame)
				?.map(player => ({
					userName: player?.userName,
					team: player?.role?.team,
					role: player?.role?.cardName
				})),
			losingPlayers: game?.private?.seatedPlayers
				?.filter(player => !player?.wonGame)
				?.map(player => ({
					userName: player?.userName,
					team: player?.role?.team,
					role: player?.role?.cardName
				})),
			winningTeam: game?.gameState?.isCompleted,
			playerCount: game?.general?.playerCount,
			rebalance6p: game?.general?.rebalance6p,
			rebalance7p: game?.general?.rebalance7p,
			rebalance9p2f: game?.general?.rebalance9p2f,
			casualGame: casualBool,
			practiceGame: practiceBool,
			customGame: game?.customGameSettings?.enabled,
			unlistedGame: unlistedBool,
			isRainbow: game?.general?.rainbowgame,
			isTournyFirstRound: game?.general?.isTourny && game?.general?.tournyInfo?.round === 1,
			isTournySecondRound: game?.general?.isTourny && game?.general?.tournyInfo?.round === 2,
			timedMode: game?.general?.timedMode,
			blindMode: game?.general?.blindMode,
			eloMinimum: game?.general?.eloMinimum,
			xpMinimum: game?.general?.xpMinimum,
			completed: true
		};
	}

	/**
	 * @param {object} - object describing game model.
	 */

	return {
		uid: game?.general?.uid,
		name: game?.general?.name,
		date: new Date(),
		guesses: objMap(game?.guesses, (_, g) => g?.toString()),
		playerChats: game?.general?.playerChats,
		chats: game?.chats?.concat(game?.private?.unSeatedGameChats)?.concat(game?.private?.replayGameChats),
		isVerifiedOnly: game?.general?.isVerifiedOnly,
		season: CURRENTSEASONNUMBER,
		losingPlayers: game?.publicPlayersState?.map(player => ({
			userName: player?.userName,
			team: player?.role && player?.role?.team,
			role: player?.role && player?.role?.cardName
		})),
		playerCount: game?.general?.playerCount,
		rebalance6p: game?.general?.rebalance6p,
		rebalance7p: game?.general?.rebalance7p,
		rebalance9p2f: game?.general?.rebalance9p2f,
		casualGame: casualBool,
		practiceGame: practiceBool,
		customGame: game?.customGameSettings?.enabled,
		unlistedGame: unlistedBool,
		isRainbow: game?.general?.rainbowgame,
		isTournyFirstRound: game?.general?.isTourny && game?.general?.tournyInfo?.round === 1,
		isTournySecondRound: game?.general?.isTourny && game?.general?.tournyInfo?.round === 2,
		timedMode: game?.general?.timedMode,
		blindMode: game?.general?.blindMode,
		eloMinimum: game?.general?.eloMinimum,
		xpMinimum: game?.general?.xpMinimum,
		completed: false
	};
};

/**
 * @param {object} game - game to act on.
 */
const saveGame = game => {
	const summary = game.gameState.isCompleted && game.private.summary && game.private.summary.publish();

	/**
	 * @param {object} - object describing game model.
	 */
	const gameToSave = new Game(generateGameObject(game));

	let enhanced;

	try {
		if (summary && summary.toObject() && game.general.uid !== 'devgame' && !game.general.private) {
			enhanced = buildEnhancedGameSummary(summary.toObject());
			updateProfiles(game, enhanced, { cache: true });
			if (!game.summarySaved) {
				summary.save();
				game.summarySaved = true;
			}
		} else {
			// console.log(summary, 'problem with summary');
		}
	} catch (error) {
		console.log(error, 'error in enhanced/end-game');
	}

	debug('Saving game: %O', summary);
	gameToSave.save();
};

// Save a game and then potentially perform another action (usually deleting the game)
const saveOrUpdateGame = (gameID, callback) => {
	const gameInMemory = games[gameID];

	Game.findOne({ uid: gameID }).then(game => {
		if (game) {
			const newObject = generateGameObject(gameInMemory); // in theory this should only be chats (as the only time a game is saved and *not* deleted is on game end) but for forwards compatibility all keys are checked

			for (const key in newObject) {
				if (newObject.hasOwnProperty(key) && game[key] !== newObject[key]) {
					// check in order to prevent unnecessarily marking fields as modified in mongoose
					game[key] = newObject[key];
				}
			}

			game.save();
		} else {
			saveGame(gameInMemory);
		}

		if (callback) callback();
	});
};

const saveAndDeleteGame = gameID => {
	saveOrUpdateGame(gameID, () => {
		delete games[gameID];
		sendGameList();
	});
};

module.exports.saveOrUpdateGame = saveOrUpdateGame;
module.exports.saveAndDeleteGame = saveAndDeleteGame;
module.exports.generateGameObject = generateGameObject;
module.exports.saveGame = saveGame;

/**
 * @param {object} game - game to act on.
 * @param {string} winningTeamName - name of the team that won this game.
 */
module.exports.completeGame = (game, winningTeamName) => {
	if (game && game.unsentReports) {
		game.unsentReports.forEach(report => {
			makeReport({ ...report }, game, report.type === 'modchat' ? 'modchatdelayed' : 'reportdelayed');
		});
		game.unsentReports = [];
	}

	for (let affectedPlayerNumber = 0; affectedPlayerNumber < game.publicPlayersState.length; affectedPlayerNumber++) {
		const affectedSocketId = Object.keys(io.sockets.sockets).find(
			socketId =>
				io.sockets.sockets[socketId].handshake.session.passport &&
				io.sockets.sockets[socketId].handshake.session.passport.user === game.publicPlayersState[affectedPlayerNumber].userName
		);
		if (!io.sockets.sockets[affectedSocketId]) {
			continue;
		}
		io.sockets.sockets[affectedSocketId].emit('removeClaim');
	}

	if (game && game.general && game.general.timedMode && game.private.timerId) {
		clearTimeout(game.private.timerId);
		game.private.timerId = null;
		game.gameState.timedModeEnabled = false;
	}

	if (game && game.general.isRecorded) {
		console.log('A game attempted to be re-recorded!', game.general.uid);
		return;
	}

	const winningPrivatePlayers = game.private.seatedPlayers.filter(player => player.role.team === winningTeamName);
	const winningPlayerNames = winningPrivatePlayers.map(player => player.userName);
	let { seatedPlayers } = game.private;
	const { publicPlayersState } = game;
	const chat = {
		gameChat: true,
		timestamp: new Date(),
		chat: [
			{
				text: winningTeamName === 'fascist' ? 'Fascists' : 'Liberals',
				type: winningTeamName === 'fascist' ? 'fascist' : 'liberal'
			},
			{ text: ' win the game.' }
		]
	};
	const remainingPoliciesChat = {
		isRemainingPolicies: true,
		timestamp: new Date(),
		chat: [
			{
				text: 'The remaining policies are '
			},
			{
				policies: game.private.policies.map(policyName => (policyName === 'liberal' ? 'b' : 'r'))
			},
			{
				text: '.'
			}
		]
	};

	if (!(game.general.isTourny && game.general.tournyInfo.round === 1)) {
		winningPrivatePlayers.forEach((player, index) => {
			publicPlayersState.find(play => play.userName === player.userName).notificationStatus = 'success';
			publicPlayersState.find(play => play.userName === player.userName).isConfetti = true;
			player.wonGame = true;
		});

		setTimeout(() => {
			winningPrivatePlayers.forEach((player, index) => {
				publicPlayersState.find(play => play.userName === player.userName).isConfetti = false;
			});
			sendInProgressGameUpdate(game, true);
		}, 15000);
	}

	game.general.status = winningTeamName === 'fascist' ? 'Fascists win the game.' : 'Liberals win the game.';
	game.gameState.isCompleted = winningTeamName;
	game.gameState.timeCompleted = Date.now();
	sendGameList();

	publicPlayersState.forEach((publicPlayer, index) => {
		publicPlayer.nameStatus = seatedPlayers[index].role.cardName;
	});

	seatedPlayers.forEach(player => {
		player.gameChats.push(chat, remainingPoliciesChat);
	});

	game.private.unSeatedGameChats.push(chat, remainingPoliciesChat);

	game.summary = game.private.summary;
	debug('Final game summary: %O', game.summary.publish().toObject());

	sendInProgressGameUpdate(game);

	saveGame(game);

	game.general.isRecorded = true;

	// Don't compute Elo for private, casual, custom, silent, private, or unlisted games
	if (
		!game.general.private &&
		game.general.playerChats !== 'disabled' &&
		!game.general.casualGame &&
		!(game.customGameSettings && game.customGameSettings.enabled) &&
		!game.general.practiceGame &&
		!game.general.unlistedGame
	) {
		Account.find({
			username: { $in: seatedPlayers.map(player => player.userName) }
		})
			.then(results => {
				const isRainbow = game.general.rainbowgame;
				const isTournamentFinalGame = game.general.isTourny && game.general.tournyInfo.round === 2;
				const eloAdjustments = rateEloGame(game, results, winningPlayerNames);

				const byUsername = (a, b) => {
					if (a.userName === b.userName)
						// this should never happen, but eh
						return 0;
					if (a.userName > b.userName) return 1;
					return -1;
				};

				seatedPlayers = [
					...seatedPlayers.filter(e => e.role.cardName === 'hitler').sort(byUsername),
					...seatedPlayers.filter(e => e.role.cardName === 'fascist').sort(byUsername),
					...seatedPlayers.filter(e => e.role.cardName === 'liberal').sort(byUsername)
				];

				seatedPlayers.forEach((eachPlayer, i) => {
					const playerChange = eloAdjustments[eachPlayer.userName];
					const activeChange = playerChange?.change;
					const activeChangeXP = playerChange?.xpChange;

					game.private.replayGameChats.push({
						gameChat: true,
						timestamp: new Date(Date.now() + i),
						chat: [
							{
								text: eachPlayer.userName,
								type: eachPlayer.role.cardName
							},
							{
								text: `'s Elo: `
							},
							{
								text: ` ${activeChange > 0 ? '+' : '-'}`
							},
							{
								text: Math.abs(activeChange).toFixed(1),
								type: 'player'
							}
						]
					});
					game.private.replayGameChats.push({
						gameChat: true,
						timestamp: new Date(Date.now() + i),
						chat: [
							{
								text: eachPlayer.userName,
								type: eachPlayer.role.cardName
							},
							{
								text: `'s XP: `
							},
							{
								text: ` ${activeChangeXP > 0 ? '+' : '-'}`
							},
							{
								text: Math.abs(activeChangeXP).toFixed(1),
								type: 'player'
							}
						]
					});
				});

				results.forEach(player => {
					const listUser = userList.find(user => user.userName === player.username);
					if (listUser) {
						listUser.eloOverall = player.eloOverall;
						listUser.eloSeason = player.eloSeason;
						listUser.xpOverall = player.xpOverall;
						listUser.xpSeason = player.xpSeason;
						listUser.isRainbowOverall = player.isRainbowOverall;
						listUser.isRainbowSeason = player.isRainbowSeason;
					}

					const seatedPlayer = seatedPlayers.find(p => p.userName === player.username);
					seatedPlayers.forEach((eachPlayer, i) => {
						const playerChange = eloAdjustments[eachPlayer.userName];
						const activeChange = player.gameSettings.disableSeasonal ? playerChange?.change : playerChange?.changeSeason;
						const activeChangeXP = player.gameSettings.disableSeasonal ? playerChange?.xpChange : playerChange?.xpChangeSeason;
						if (!player.gameSettings.disableElo) {
							seatedPlayer.gameChats.push({
								gameChat: true,
								timestamp: new Date(Date.now() + i),
								chat: [
									{
										text: eachPlayer.userName,
										type: eachPlayer.role.cardName
									},
									{
										text: `'s Elo: `
									},
									{
										text: ` ${activeChange > 0 ? '+' : '-'}`
									},
									{
										text: Math.abs(activeChange).toFixed(1),
										type: 'player'
									}
								]
							});
							seatedPlayer.gameChats.push({
								gameChat: true,
								timestamp: new Date(Date.now() + i),
								chat: [
									{
										text: eachPlayer.userName,
										type: eachPlayer.role.cardName
									},
									{
										text: `'s XP: `
									},
									{
										text: ` ${activeChangeXP > 0 ? '+' : '-'}`
									},
									{
										text: Math.abs(activeChangeXP).toFixed(1),
										type: 'player'
									}
								]
							});
						}
					});

					let winner = false;

					if (winningPlayerNames.includes(player.username)) {
						if (isRainbow) {
							player.rainbowWins = player.rainbowWins ? player.rainbowWins + 1 : 1;
							player[`rainbowWinsSeason${CURRENTSEASONNUMBER}`] = player[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
								? player[`rainbowWinsSeason${CURRENTSEASONNUMBER}`] + 1
								: 1;
							player[`rainbowLossesSeason${CURRENTSEASONNUMBER}`] = player[`rainbowLossesSeason${CURRENTSEASONNUMBER}`]
								? player[`rainbowLossesSeason${CURRENTSEASONNUMBER}`]
								: 0;
						}

						player[`winsSeason${CURRENTSEASONNUMBER}`] = player[`winsSeason${CURRENTSEASONNUMBER}`] ? player[`winsSeason${CURRENTSEASONNUMBER}`] + 1 : 1;
						player.wins = player.wins ? player.wins + 1 : 1;
						player[`lossesSeason${CURRENTSEASONNUMBER}`] = player[`lossesSeason${CURRENTSEASONNUMBER}`] ? player[`lossesSeason${CURRENTSEASONNUMBER}`] : 0;
						winner = true;

						if (isTournamentFinalGame && !game.general.casualGame) {
							player.gameSettings.tournyWins.push(Date.now());
							const playerSocketId = Object.keys(io.sockets.sockets).find(
								socketId =>
									io.sockets.sockets[socketId].handshake.session.passport && io.sockets.sockets[socketId].handshake.session.passport.user === player.username
							);

							io.sockets.sockets[playerSocketId].emit('gameSettings', player.gameSettings);
						}
					} else {
						if (isRainbow) {
							player.rainbowLosses = player.rainbowLosses ? player.rainbowLosses + 1 : 1;
							player[`rainbowLossesSeason${CURRENTSEASONNUMBER}`] = player[`rainbowLossesSeason${CURRENTSEASONNUMBER}`]
								? player[`rainbowLossesSeason${CURRENTSEASONNUMBER}`] + 1
								: 1;
							player[`rainbowWinsSeason${CURRENTSEASONNUMBER}`] = player[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
								? player[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
								: 0;
						}

						player.losses++;
						player[`lossesSeason${CURRENTSEASONNUMBER}`] = player[`lossesSeason${CURRENTSEASONNUMBER}`] ? player[`lossesSeason${CURRENTSEASONNUMBER}`] + 1 : 1;
						player[`winsSeason${CURRENTSEASONNUMBER}`] = player[`winsSeason${CURRENTSEASONNUMBER}`] ? player[`winsSeason${CURRENTSEASONNUMBER}`] : 0;
					}

					player.games.push(game.general.uid);
					player.lastCompletedGame = new Date();
					checkBadgesELO(player, game.general.uid);
					checkBadgesXP(player, game.general.uid);
					player.save(() => {
						const userEntry = userList.find(user => user.userName === player.username);

						if (userEntry) {
							userEntry.xpSeason = player.xpSeason || 0;
							userEntry.isRainbowSeason = player.isRainbowSeason;
							userEntry.xpOverall = player.xpOverall || 0;
							userEntry.isRainbowOverall = player.isRainbowOverall;

							if (winner) {
								if (isRainbow) {
									userEntry.rainbowWins = userEntry.rainbowWins ? userEntry.rainbowWins + 1 : 1;
									userEntry.rainbowLosses = userEntry.rainbowLosses ? userEntry.rainbowLosses : 0;
									userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`] = userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
										? userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`] + 1
										: 1;
									userEntry[`rainbowLossesSeason${CURRENTSEASONNUMBER}`] = userEntry[`rainbowLossesSeason${CURRENTSEASONNUMBER}`]
										? userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
										: 0;
								}
								userEntry.wins = userEntry.wins ? userEntry.wins + 1 : 1;
								userEntry[`winsSeason${CURRENTSEASONNUMBER}`] = userEntry[`winsSeason${CURRENTSEASONNUMBER}`]
									? userEntry[`winsSeason${CURRENTSEASONNUMBER}`] + 1
									: 1;
								userEntry[`lossesSeason${CURRENTSEASONNUMBER}`] = userEntry[`lossesSeason${CURRENTSEASONNUMBER}`]
									? userEntry[`lossesSeason${CURRENTSEASONNUMBER}`]
									: 0;

								if (isTournamentFinalGame && !game.general.casualGame) {
									userEntry.tournyWins.push(Date.now());
								}
							} else {
								if (isRainbow) {
									userEntry.rainbowLosses = userEntry.rainbowLosses ? userEntry.rainbowLosses + 1 : 1;
									userEntry[`rainbowLossesSeason${CURRENTSEASONNUMBER}`] = userEntry[`rainbowLossesSeason${CURRENTSEASONNUMBER}`]
										? userEntry[`rainbowLossesSeason${CURRENTSEASONNUMBER}`] + 1
										: 1;
									userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`] = userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
										? userEntry[`rainbowWinsSeason${CURRENTSEASONNUMBER}`]
										: 0;
								}
								userEntry.losses = userEntry.losses ? userEntry.losses + 1 : 1;
								userEntry[`lossesSeason${CURRENTSEASONNUMBER}`] = userEntry[`lossesSeason${CURRENTSEASONNUMBER}`]
									? userEntry[`lossesSeason${CURRENTSEASONNUMBER}`] + 1
									: 1;
								userEntry[`winsSeason${CURRENTSEASONNUMBER}`] = userEntry[`winsSeason${CURRENTSEASONNUMBER}`]
									? userEntry[`winsSeason${CURRENTSEASONNUMBER}`]
									: 0;
							}

							sendUserList();
						}
					});
				});
				sendInProgressGameUpdate(game);
			})
			.catch(err => {
				console.log(err, 'error in updating accounts at end of game');
			});
	} else if (game.general.playerChats === 'disabled' || game.general.practiceGame) {
		// 2 XP for win, 1 for loss
		Account.find({
			username: { $in: seatedPlayers.map(player => player.userName) }
		}).then(results => {
			for (const player of results) {
				if (winningPlayerNames.includes(player.username)) {
					player.xpOverall += 2;
					player.xpSeason += 2;
				} else {
					player.xpOverall += 1;
					player.xpSeason += 1;
				}

				if (player.xpOverall >= 50.0) {
					player.isRainbowOverall = true;
					player.dateRainbowOverall = new Date();
				}

				if (player.xpSeason >= 50.0) {
					player.isRainbowSeason = true;
				}

				checkBadgesXP(player, game.general.uid);
				player.save();
			}
		});
	}

	if (game.general.isTourny) {
		if (game.general.tournyInfo.round === 1) {
			const { uid } = game.general;
			const tableUidLastLetter = uid.charAt(uid.length - 1);
			const otherUid = tableUidLastLetter === 'A' ? `${uid.substr(0, uid.length - 1)}B` : `${uid.substr(0, uid.length - 1)}A`;
			const otherGame = games.find(g => g.general.uid === otherUid);

			if (!otherGame || otherGame.gameState.isCompleted) {
				const finalGame = _.cloneDeep(game);
				let gamePause = 10;

				finalGame.general.uid = `${uid.substr(0, uid.length - 1)}Final`;
				finalGame.general.timeCreated = new Date();
				finalGame.gameState = {
					previousElectedGovernment: [],
					undrawnPolicyCount: 17,
					discardedPolicyCount: 0,
					presidentIndex: -1,
					isStarted: true
				};
				finalGame.trackState = {
					liberalPolicyCount: 0,
					fascistPolicyCount: 0,
					electionTrackerCount: 0,
					enactedPolicies: []
				};

				const countDown = setInterval(() => {
					if (gamePause) {
						game.general.status = `Final game starts in ${gamePause} ${gamePause === 1 ? 'second' : 'seconds'}.`;
						if (otherGame) {
							otherGame.general.status = `Final game starts in ${gamePause} ${gamePause === 1 ? 'second' : 'seconds'}.`;
							sendInProgressGameUpdate(otherGame);
						}
						sendInProgressGameUpdate(game);
						gamePause--;
					} else {
						clearInterval(countDown);
						game.general.status = 'Final game has begun.';
						if (otherGame) {
							otherGame.general.status = 'Final game has begun.';
							sendInProgressGameUpdate(otherGame);
						}
						game.general.tournyInfo.isRound1TableThatFinished2nd = true;
						sendInProgressGameUpdate(game);
						const winningPlayerSocketIds = Object.keys(io.sockets.sockets).filter(
							socketId =>
								io.sockets.sockets[socketId].handshake.session.passport &&
								winningPrivatePlayers.map(player => player.userName).includes(io.sockets.sockets[socketId].handshake.session.passport.user)
						);

						// crash here line 302 map of undefined.  Not sure how this didn't exist at this time.  Race condition in settimeout/interval?  Both games completed at almost the same time?  Dunno.
						const otherGameWinningPlayerSocketIds = Object.keys(io.sockets.sockets).filter(
							socketId =>
								io.sockets.sockets[socketId].handshake.session.passport &&
								game.general.tournyInfo.winningPlayersFirstCompletedGame
									.map(player => player.userName)
									.includes(io.sockets.sockets[socketId].handshake.session.passport.user)
						);

						const socketIds = winningPlayerSocketIds.concat(otherGameWinningPlayerSocketIds);

						socketIds.forEach(id => {
							const socket = io.sockets.sockets[id];

							Object.keys(socket.rooms).forEach(roomUid => {
								socket.leave(roomUid);
							});
							socket.join(finalGame.general.uid);
							socket.emit('joinGameRedirect', finalGame.general.uid);
						});

						finalGame.general.tournyInfo.round = 2;
						finalGame.general.electionCount = 0;
						finalGame.publicPlayersState = game.general.tournyInfo.winningPlayersFirstCompletedGame
							.concat(game.private.seatedPlayers.filter(player => player.role.team === winningTeamName))
							.map(player => {
								player.cardStatus = {
									cardDisplayed: false,
									isFlipped: false,
									cardFront: 'secretrole',
									cardBack: {}
								};

								player.isDead = false;

								return player;
							});

						if (finalGame.general.blindMode) {
							const _shuffledAdjectives = _.shuffle(adjectives);

							finalGame.general.replacementNames = _.shuffle(animals)
								.slice(0, finalGame.publicPlayersState.length)
								.map((animal, index) => `${_shuffledAdjectives[index].charAt(0).toUpperCase()}${_shuffledAdjectives[index].slice(1)} ${animal}`);
						}

						finalGame.private.lock = {};
						finalGame.general.name = `${game.general.name.slice(0, game.general.name.length - 7)}-tableFINAL`;
						games.push(finalGame);
						require('./start-game.js')(finalGame); // circular dep.
						sendGameList();
					}
				}, 1000)[Symbol.toPrimitive]();
			} else {
				game.general.tournyInfo.showOtherTournyTable = true;
				game.chats.push({
					gameChat: true,
					timestamp: new Date(),
					chat: [
						{
							text: 'This tournament game has finished first.  Winning players will be pulled into the final round when it starts.'
						}
					]
				});
				otherGame.general.tournyInfo.winningPlayersFirstCompletedGame = _.cloneDeep(game.private.seatedPlayers).filter(
					player => player.role.team === winningTeamName
				);
				sendInProgressGameUpdate(game);
			}
		} else {
			if (!game.general.casualGame) {
				game.publicPlayersState.forEach(player => {
					if (winningPlayerNames.includes(player.userName)) {
						player.tournyWins.push(new Date().getTime());
					}
				});
			}
			game.chats.push({
				gameChat: true,
				timestamp: new Date(),
				chat: [
					{
						text: 'The tournament has ended.'
					}
				]
			});
			game.general.status = 'The tournament has ended.';
			sendInProgressGameUpdate(game);
		}
	}

	// Line guesses not supported in casual and custom games
	if (!game.general.private && !(game.customGameSettings && game.customGameSettings.enabled)) {
		const { guesses } = game;

		const hittySeat = game.private.seatedPlayers.findIndex(p => p.role.cardName === 'hitler') + 1;
		const fasSeats = game.private.seatedPlayers
			.map((p, i) => [p, i])
			.filter(([p, _]) => p.role.team === 'fascist')
			.map(([_, i]) => i + 1);

		const numFas = fasSeats.length;
		const lines = new LineGuess({ regs: fasSeats, hit: hittySeat });

		const groupedGuesses = { 0: [], 1: [], 2: [], 3: [], 4: [] };
		const perfectGuesses = [];
		const hittyGuesses = [];

		for (const [user, guess] of Object.entries(guesses)) {
			const [fasCorrect, hitCorrect] = guess.difference(lines);
			if (fasCorrect === numFas && hitCorrect) {
				perfectGuesses.push([user, guess]);
			} else {
				groupedGuesses[fasCorrect].push([user, guess]);

				if (hitCorrect) {
					hittyGuesses.push([user, guess]);
				}
			}
		}

		let guessOrder = 2;
		const now = Date.now();
		const guessesToChat = (prefix, guesses) => ({
			gameChat: true,
			timestamp: now + guessOrder++,
			chat: [
				{
					text: prefix + guesses.map(([user, guess]) => `${user} (${guess.toString()})`).join(', ')
				}
			]
		});

		if (
			groupedGuesses[0].length ||
			groupedGuesses[1].length ||
			groupedGuesses[2].length ||
			groupedGuesses[3].length ||
			groupedGuesses[4].length ||
			perfectGuesses.length ||
			hittyGuesses.length
		) {
			game.chats.push({
				gameChat: true,
				timestamp: now,
				chat: [
					{
						text: 'Line Guesses',
						type: 'player'
					}
				]
			});
		}

		if (perfectGuesses.length) {
			game.chats.push(guessesToChat('All fascists AND hitler correct - ', perfectGuesses));
		}

		for (let i = numFas; i >= 0; i--) {
			const prefix =
				i === numFas
					? 'All fascists correct - '
					: i === 3
					? 'Three fascists correct - '
					: i === 2
					? 'Two fascists correct - '
					: i === 1
					? 'One fascist correct - '
					: 'No fascists correct :( -';

			if (groupedGuesses[i].length) {
				game.chats.push(guessesToChat(prefix, groupedGuesses[i]));
			}
		}

		if (hittyGuesses.length) {
			game.chats.push(guessesToChat('Hitler correct - ', hittyGuesses));
		}

		sendInProgressGameUpdate(game);
	}
};
