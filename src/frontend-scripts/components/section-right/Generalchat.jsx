import React from 'react';
import { PLAYERCOLORS, getBadWord } from '../../constants';
import PropTypes from 'prop-types';
import { renderEmotesButton, processEmotes } from '../../emotes';
import { Scrollbars } from 'react-custom-scrollbars';
import moment from 'moment';

export default class Generalchat extends React.Component {
	defaultEmotes = ['ja', 'nein', 'blobsweat', 'wethink', 'limes'];

	state = {
		lock: false,
		badWord: [null, null],
		textLastChanged: 0,
		textChangeTimer: -1,
		chatValue: '',
		emoteHelperSelectedIndex: 0,
		emoteHelperElements: this.defaultEmotes,
		emoteColonIndex: -1,
		excludedColonIndices: [],
		genchat: true,
		modDMs: null
	};

	componentDidMount() {
		if (this.scrollbar) {
			this.scrollbar.scrollToBottom();
		}

		if (this.props.socket) {
			this.props.socket.on('openModDMs', data => {
				this.setState({ modDMs: data, genchat: false });
			});

			this.props.socket.on('closeModDMs', () => {
				this.setState({ modDMs: null, genchat: true });
			});

			this.props.socket.on('inProgressModDMUpdate', dm => {
				this.setState({ modDMs: dm });
			});
		}
	}

	componentWillUnmount() {
		this.props.socket.off('openModDMs');
		this.props.socket.off('closeModDMs');
		this.props.socket.off('inProgressModDMUpdate');
	}

	componentDidUpdate() {
		if (!this.state.lock) {
			this.scrollbar.scrollToBottom();
		}
	}

	renderPreviousSeasonAward(type) {
		switch (type) {
			case 'bronze':
				return <span title="This player was in the 3rd tier of ranks in the previous season" className="season-award bronze" />;
			case 'silver':
				return <span title="This player was in the 2nd tier of ranks in the previous season" className="season-award silver" />;
			case 'gold':
				return <span title="This player was in the top tier of ranks in the previous season" className="season-award gold" />;
			case 'gold1':
				return <span title="This player was the #1 ranked player of the previous season" className="season-award gold1" />;
			case 'gold2':
				return <span title="This player was 2nd highest player of the previous season" className="season-award gold2" />;
			case 'gold3':
				return <span title="This player was 3rd highest player of the previous season" className="season-award gold3" />;
			case 'gold4':
				return <span title="This player was 4th highest player of the previous season" className="season-award gold4" />;
			case 'gold5':
				return <span title="This player was 5th highest player of the previous season" className="season-award gold5" />;
		}
	}

	handleTyping = e => {
		e.preventDefault();
		const { allEmotes } = this.props;
		const { badWord, textChangeTimer } = this.state;
		let { excludedColonIndices } = this.state;
		const { value } = e.target;
		const emoteNames = Object.keys(allEmotes).map(emoteName => emoteName.slice(1, emoteName.length - 1));
		let emoteColonIndex = value.substring(0, e.target.selectionStart).lastIndexOf(':');
		let filteredEmotes = [];
		const colonSplitText = value.substring(0, emoteColonIndex).split(':');

		if (
			!/^[a-zA-Z]*$/.test(value.substring(emoteColonIndex + 1, e.target.selectionStart)) ||
			excludedColonIndices.includes(emoteColonIndex) ||
			(colonSplitText.length > 1 && colonSplitText.slice(-1)[0].indexOf(' ') === -1) ||
			!/^ ?$/.test(value.substring(0, emoteColonIndex).slice(-1))
		) {
			emoteColonIndex = -1;
		}

		excludedColonIndices = excludedColonIndices.map(i => (value.length <= i || value[i] !== ':' ? null : i)).filter(Number.isInteger);

		if (value.lastIndexOf(':') === e.target.selectionStart - 1) {
			this.setState({ emoteHelperSelectedIndex: -1 });
		}

		if (emoteColonIndex >= 0) {
			const textAfterColon = value
				.slice(emoteColonIndex + 1)
				.split(' ')[0]
				.split(':')[0];
			filteredEmotes = textAfterColon ? emoteNames.filter(emote => emote.toLowerCase().includes(textAfterColon.toLowerCase())).slice(0, 5) : this.defaultEmotes;
			emoteColonIndex = emoteNames.includes(textAfterColon + ':') ? -1 : emoteColonIndex;
		}
		this.setState({
			emoteHelperElements: filteredEmotes.length ? filteredEmotes : this.defaultEmotes,
			chatValue: value,
			emoteColonIndex,
			excludedColonIndices
		});

		const foundWord = getBadWord(value);

		if (badWord[0] !== foundWord[0]) {
			if (textChangeTimer !== -1) {
				clearTimeout(textChangeTimer);
			}

			if (foundWord[0]) {
				this.setState({
					badWord: foundWord,
					textLastChanged: Date.now(),
					textChangeTimer: setTimeout(() => {
						this.setState({ textChangeTimer: -1 });
					}, 2000)
				});
			} else {
				this.setState({
					badWord: [null, null],
					textChangeTimer: -1
				});
			}
		}
	};

	generalChatStatus = () => {
		const { userInfo } = this.props;
		const { userName } = userInfo;

		if (!this.state.genchat && this.state.modDMs) {
			// you can always chat with a mod even if you are new, unless you are an observing mod
			if (userName === this.state.modDMs.username || userName === this.state.modDMs.aemMember)
				return {
					isDisabled: false,
					placeholder: 'Send a message'
				};
			return {
				isDisabled: true,
				placeholder: 'You are observing a conversation'
			};
		}

		if (!userName) {
			return {
				isDisabled: true,
				placeholder: 'You must log in to use chat'
			};
		}

		const user = Object.keys(this.props.userList).length ? this.props.userList.list.find(play => play.userName === userName) : undefined;

		if (!user) {
			return {
				isDisabled: true,
				placeholder: 'Please reload...'
			};
		}

		if (userInfo.gameSettings && userInfo.gameSettings.isPrivate) {
			return {
				isDisabled: true,
				placeholder: 'Your account is private and cannot participate in general chat'
			};
		}

		if ((user.xpOverall || 0) < 10 && !user.isRainbowOverall) {
			return {
				isDisabled: true,
				placeholder: 'You must have 10 XP to use general chat'
			};
		}

		return {
			isDisabled: false,
			placeholder: 'Send a message'
		};
	};

	chatDisabled = () => this.state.badWord[0] && Date.now() - this.state.textLastChanged < 1000;

	handleSubmit = () => {
		if (this.chatDisabled()) {
			return;
		}

		const { chatValue } = this.state;

		if (chatValue && chatValue.length <= 300) {
			if (this.state.genchat) {
				this.props.socket.emit('addNewGeneralChat', {
					chat: chatValue
				});
			} else {
				this.props.socket.emit('modDMsAddChat', {
					chat: chatValue
				});
			}

			this.setState({
				chatValue: '',
				badWord: [null, null],
				excludedColonIndices: [],
				emoteColonIndex: -1,
				emoteHelperElements: this.defaultEmotes,
				emoteHelperSelectedIndex: -1
			});
		}
	};

	handleChatLockClick = () => {
		this.setState({ lock: !this.state.lock });
	};

	handleChatScrolled = () => {
		const bar = this.scrollbar;

		if (this.state.lock && bar.getValues().top > 0.96) {
			this.setState({ lock: false });
			this.scrollbar.scrollToBottom();
		} else if (!this.state.lock && bar.getValues().top <= 0.96) {
			this.setState({ lock: true });
		}
	};

	handleInsertEmote = (emote, isHelper) => {
		const { chatValue, emoteColonIndex } = this.state;
		const textAfterColon =
			':' +
			chatValue
				.slice(emoteColonIndex + 1)
				.split(' ')[0]
				.split(':')[0];
		let helperChatArr;

		if (isHelper) {
			helperChatArr = chatValue.split('');
			helperChatArr.splice(emoteColonIndex, textAfterColon.length, `:${emote}: `);
		}

		this.setState({
			chatValue: isHelper ? helperChatArr.join('') : `${chatValue}${emote} `,
			emoteColonIndex: -1,
			emoteHelperSelectedIndex: -1
		});

		if (!isHelper) this.chatInput.focus();
	};

	handleKeyPress = e => {
		const { emoteHelperSelectedIndex, emoteHelperElements, emoteColonIndex, excludedColonIndices } = this.state;
		const { keyCode } = e;
		const emoteHelperElementCount = emoteHelperElements && emoteHelperElements.length;

		if (emoteColonIndex >= 0) {
			if (keyCode === 27) {
				// esc
				this.setState({
					excludedColonIndices: [...excludedColonIndices, emoteColonIndex],
					emoteColonIndex: -1
				});
			} else if (keyCode === 40) {
				// arrow key
				const nextIndex = emoteHelperSelectedIndex + 1;
				e.preventDefault(); // prevents moving to home and end of textarea
				this.setState({
					emoteHelperSelectedIndex: nextIndex === emoteHelperElementCount ? 0 : nextIndex
				});
			} else if (keyCode === 38) {
				// arrow key
				e.preventDefault(); // prevents moving to home and end of textarea
				this.setState({
					emoteHelperSelectedIndex: emoteHelperSelectedIndex ? emoteHelperSelectedIndex - 1 : emoteHelperElementCount - 1
				});
			} else if (keyCode === 9 || keyCode === 13) {
				// enter and tab
				e.preventDefault(); // prevents from tabbing out of input
				if (emoteHelperSelectedIndex >= 0) {
					this.handleInsertEmote(emoteHelperElements[emoteHelperSelectedIndex], true);
					this.setState({
						emoteColonIndex: -1
					});
				} else {
					this.handleSubmit();
				}
			}
		} else if (keyCode === 13 && !e.shiftKey) {
			e.preventDefault();
			this.handleSubmit();
		}
	};

	renderInput() {
		return (
			<div className={this.generalChatStatus().isDisabled ? 'ui action input disabled' : 'ui action input'}>
				{this.state.badWord[0] && (
					<span
						style={{
							position: 'absolute',
							top: '-22px',
							height: '40px',
							backgroundColor: 'indianred',
							padding: '7px',
							borderRadius: '10px 10px 0px 0px',
							border: '1px solid #8c8c8c'
						}}
					>
						"{this.state.badWord[1]}"{this.state.badWord[0] !== this.state.badWord[1] ? ` (${this.state.badWord[0]})` : ''} is forbidden.
					</span>
				)}
				{this.state.chatValue.length > 300 && !this.state.badWord[0] && (
					<span
						style={{
							position: 'absolute',
							top: '-22px',
							height: '40px',
							backgroundColor: 'indianred',
							padding: '7px',
							borderRadius: '10px 10px 0px 0px',
							border: '1px solid #8c8c8c'
						}}
					>
						{`This message is too long ${300 - this.state.chatValue.length}`}
					</span>
				)}
				<textarea
					style={{ zIndex: 1 }}
					disabled={this.generalChatStatus().isDisabled}
					className="chat-input-box"
					placeholder={this.generalChatStatus().placeholder}
					value={this.state.chatValue}
					spellCheck="false"
					onKeyDown={this.handleKeyPress}
					onChange={this.handleTyping}
					ref={c => (this.chatInput = c)}
				/>
				{!this.generalChatStatus().isDisabled && renderEmotesButton(this.handleInsertEmote, this.props.allEmotes)}
				{this.state.modDMs !== null &&
					(this.state.modDMs.aemMember === this.props.userInfo.userName ||
						this.props.userInfo.staffRole === 'editor' ||
						this.props.userInfo.staffRole === 'admin') &&
					!this.state.genchat && (
						<div className="chat-button" style={{ display: 'inline' }}>
							<button
								onClick={() => {
									this.props.socket.emit('aemCloseChat', { userName: this.props.userInfo.userName });
								}}
								className={`ui primary button ${this.chatDisabled() ? 'disabled' : ''}`}
							>
								Close Conversation
							</button>
						</div>
					)}
				{this.props.userInfo.staffRole && this.state.modDMs !== null && this.state.modDMs.aemMember !== this.props.userInfo.userName && (
					<div className="chat-button" style={{ display: 'inline' }}>
						<button
							onClick={() => {
								this.props.socket.emit('aemUnsubscribeChat', { userName: this.props.userInfo.userName });
							}}
							className={`ui primary button`}
						>
							Leave Conversation
						</button>
					</div>
				)}
				<div className="chat-button">
					<button onClick={this.handleSubmit} className={`ui primary button ${this.chatDisabled() ? 'disabled' : ''}`}>
						Chat
					</button>
				</div>
			</div>
		);
	}

	renderChats() {
		let timestamp;
		const { userInfo, userList, generalChats } = this.props;
		const time = Date.now();

		/**
		 * @param {array} tournyWins - array of tournywins in epoch ms numbers (date.getTime())
		 * @return {jsx}
		 */
		const renderCrowns = tournyWins =>
			tournyWins
				.filter(winTime => time - winTime < 10800000)
				.map(crown => <span key={crown} title="This player has recently won a tournament." className="crown-icon" />);

		const chatToRender = this.state.genchat ? generalChats : { list: this.state.modDMs?.messages };

		return (
			chatToRender.list &&
			chatToRender.list.map((chat, i) => {
				const { gameSettings } = userInfo;
				const isMod = Boolean(chat.staffRole) || chat.userName.substring(0, 11) == '[BROADCAST]';
				const user = chat.userName && Object.keys(userList).length ? userList.list.find(player => player.userName === chat.userName) : undefined;
				const userClasses =
					!user || (gameSettings && gameSettings.disablePlayerColorsInChat)
						? 'chat-user'
						: PLAYERCOLORS(user, !(gameSettings && gameSettings.disableSeasonal), 'chat-user');

				if (userInfo.gameSettings && userInfo.gameSettings.enableTimestamps) {
					timestamp = <span className="timestamp">{moment(chat.time).format('HH:mm')} </span>;
				}

				return (
					<div className="item" key={i}>
						{timestamp}
						{!(userInfo.gameSettings && Object.keys(userInfo.gameSettings).length && userInfo.gameSettings.disableCrowns) &&
							chat.tournyWins &&
							renderCrowns(chat.tournyWins)}
						{!(userInfo.gameSettings && Object.keys(userInfo.gameSettings).length && userInfo.gameSettings.disableCrowns) &&
							chat.previousSeasonAward &&
							this.renderPreviousSeasonAward(chat.previousSeasonAward)}
						{!(userInfo.gameSettings && Object.keys(userInfo.gameSettings).length && userInfo.gameSettings.disableCrowns) &&
							chat.specialTournamentStatus &&
							chat.specialTournamentStatus.slice(1) === 'captain' && (
								<span
									title={`This player a Captain of the winning team of the ${getNumberWithOrdinal(chat.specialTournamentStatus[0])} Official Tournament.`}
									className="crown-captain-icon"
								/>
							)}
						{!(userInfo.gameSettings && Object.keys(userInfo.gameSettings).length && userInfo.gameSettings.disableCrowns) &&
							chat.specialTournamentStatus &&
							chat.specialTournamentStatus.slice(1) === 'tourney' && (
								<span
									title={`This player was part of the winning team of the ${getNumberWithOrdinal(chat.specialTournamentStatus[0])} Official Tournament.`}
									className="crown-icon"
								/>
							)}
						<span
							className={
								chat.isBroadcast
									? 'chat-user broadcast'
									: chat.staffRole === 'moderator' && chat.userName === 'Incognito' && !userInfo.staffRole
									? 'chat-user moderatorcolor'
									: userClasses
							}
						>
							{chat.staffRole === 'moderator' &&
								!(chat.userName === 'Incognito' && userInfo.staffRole && userInfo.staffRole !== 'altmod' && userInfo.staffRole !== 'veteran') && (
									<span className="moderatorcolor">(M) 🌀</span>
								)}
							{chat.staffRole === 'editor' && <span className="editor-name">(E) 🔰</span>}
							{chat.staffRole === 'admin' && <span className="admin-name">(A) 📛</span>}
							{chat.staffRole === 'moderator' &&
								chat.userName === 'Incognito' &&
								userInfo.staffRole &&
								userInfo.staffRole !== 'altmod' &&
								userInfo.staffRole !== 'veteran' && (
									<span data-tooltip="Incognito" data-inverted>
										<span className="admin-name">(I) 🚫</span>
									</span>
								)}
							<a
								href={chat.isBroadcast ? '#/profile/' + chat.userName.split(' ').pop() : `#/profile/${chat.userName}`}
								className={chat.staffRole === 'moderator' && chat.userName === 'Incognito' && !userInfo.staffRole ? 'genchat-user moderatorcolor' : userClasses}
							>
								{`${
									chat.staffRole === 'moderator' &&
									chat.userName === 'Incognito' &&
									userInfo.staffRole &&
									userInfo.staffRole !== 'altmod' &&
									userInfo.staffRole !== 'veteran'
										? chat.hiddenUsername
										: chat.userName
								}${chat.type === 'join' || chat.type === 'leave' ? '' : ':'} `}
							</a>
						</span>
						<span className={chat.isBroadcast ? 'broadcast-chat' : /^>/i.test(chat.chat) ? 'greentext' : ''}>
							{processEmotes(chat.chat, isMod, this.props.allEmotes)}
						</span>
					</div>
				);
			})
		);
	}

	renderEmoteHelper() {
		const { allEmotes } = this.props;
		const { emoteHelperSelectedIndex, emoteHelperElements } = this.state;
		const helperHover = index => {
			this.setState({
				emoteHelperSelectedIndex: index
			});
		};

		if (emoteHelperSelectedIndex > emoteHelperElements.length) this.setState({ emoteHelperSelectedIndex: 0 });

		if (!Number.isInteger(emoteHelperSelectedIndex) || !emoteHelperElements.length) return;

		return (
			<div className="emote-helper-container">
				{emoteHelperElements.map((el, index) => (
					<div
						onMouseOver={() => {
							helperHover(index);
						}}
						onClick={() => {
							this.handleInsertEmote(el, true);
							this.chatInput.focus();
						}}
						key={index}
						className={emoteHelperSelectedIndex === index ? 'selected' : ''}
					>
						<img
							src={allEmotes[`:${el}:`]}
							style={{
								height: '28px',
								margin: '2px 10px 2px 5px'
							}}
						/>
						{`${el}`}
					</div>
				))}
			</div>
		);
	}

	render() {
		const { lock, emoteColonIndex } = this.state;

		return (
			<section className="generalchat">
				<section className="generalchat-header">
					<div className="clearfix">
						<div className="ui ui-theme top attached menu">
							<a
								className={`${this.state.genchat ? 'active' : ''} item`}
								onClick={() => {
									this.setState({ genchat: true });
								}}
							>
								Chat
							</a>
							{this.state.modDMs != null && (
								<a
									className={`${!this.state.genchat ? 'active' : ''} item`}
									onClick={() => {
										this.setState({ genchat: false });
									}}
								>
									Mod Messages
								</a>
							)}
						</div>
						<i
							title="Click here to lock chat and prevent from scrolling"
							className={lock ? 'large lock icon' : 'large unlock alternate icon'}
							onClick={this.handleChatLockClick}
						/>
					</div>
				</section>
				<section className="segment chats">
					{emoteColonIndex >= 0 && this.renderEmoteHelper()}
					<Scrollbars
						ref={c => (this.scrollbar = c)}
						onScroll={this.handleChatScrolled}
						renderThumbVertical={props => <div {...props} className="thumb-vertical" />}
					>
						<div className="ui list genchat-container">{this.renderChats()}</div>
					</Scrollbars>
				</section>
				{this.renderInput()}
			</section>
		);
	}
}

Generalchat.defaultProps = {
	generalChats: {},
	userInfo: {}
};

Generalchat.propTypes = {
	gameInfo: PropTypes.object,
	userInfo: PropTypes.object,
	socket: PropTypes.object,
	generalChats: PropTypes.object,
	userList: PropTypes.object,
	allEmotes: PropTypes.object
};
