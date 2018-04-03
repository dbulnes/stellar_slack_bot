const Adapter     = require('../abstract');
const slackClient = require('./slack-client');
const StellarSdk = require('stellar-sdk')
const Utils       = require('../../utils')
const oauth_token = process.env.SLACK_BOT_OAUTH_TOKEN;
const Command     = require('../commands/command')
const Analytics   = require('../../loggers/tip-analytics')
const Account     = require('../../models/account')

/**
 * The Slack adapter itself is actually what is responsible for generating
 * messages during particular events (such as when a user withdraws XLM, or doesn't have a high enough balance).
 */
class Slack extends Adapter {

  getLogger() {
    return Analytics;
  }

  async onTipWithInsufficientBalance (tip, amount) {
    const account = await this.Account.getOrCreate(tip.adapter, tip.sourceId);
    return `Sorry, your tip could not be processed. Your account only contains \`${Utils.formatNumber(account.balance)} XLM\` but you tried to send \`${Utils.formatNumber(amount)} XLM\``
  }

  // TODO: Put this under test.
  /**
   * Called when our attempt at placing the tip transaction fails for some reason.
   * Could be a non-responsive server, or any number of reasons.
   * @param tip
   * @param amount
   * @returns {Promise<string>}
   */
  async onTipTransferFailed(tip, amount) {
    return "There was an error while trying to send your tip. Please try again."
  }

  /**
   * Called when the user attempts to tip themself.
   * // TODO: Should probably come up with a less generic sounding name than this.
   *
   * @param tip {Tip}
   * @param amount The amount which the user tried to tip
   * @returns {Promise<string>}
   */
  async onTipReferenceError (tip, amount) {
    return `What is the sound of one tipper tipping?`
  }

  /**
   * Called when a user tries to tip someone but there isn't actually a user with that username.
   * @param tip
   * @returns {Promise<string>}
   */
  async onTipNoTargetFound (tip) {
    return `Your tip was cancelled. We could not find a user with that username. Make sure it is formatted correctly, such as '@username'.`
  }

  /**
   * Called when the tip goes through successfully.
   * For the Slack Adapter, a DM will get sent to the tip recipient whose content depends on whether or not they are already registered.
   * Text is also returned so that the Slack Server can respond with an appropriate message.
   *
   * @param tip {Tip}
   * @param amount {float}
   * @returns {Promise<string>}
   */
  async onTip (tip, amount) {
    const account = await this.Account.getOrCreate(tip.adapter, tip.targetId)
    let client = await this.getBotClientForCommand(tip)
    if(!account.walletAddress) {
      this.getLogger().MessagingEvents.onTipReceivedMessageSent(tip, false)
      client.sendPlainTextDMToSlackUser(tip.targetId,
          `Someone tipped you \`${Utils.formatNumber(amount)} XLM\`\n\nIn order to withdraw your funds, first register your public key by typing /register [your public key]\n\nYou can also tip other users using the /tip command.`)
    } else {
      this.getLogger().MessagingEvents.onTipReceivedMessageSent(tip, true)
      client.sendPlainTextDMToSlackUser(tip.targetId,
          `Someone tipped you \`${Utils.formatNumber(amount)} XLM\``);
    }

    this.getLogger().CommandEvents.onTipSuccess(tip)
    return `You successfully tipped \`${Utils.formatNumber(amount)} XLM\``
  }

  /**
   *
   * @param withdrawal {Withdraw}
   * @returns {Promise<string>}
   */
  // TODO: Refactor {Withdraw}
  async onWithdrawalNoAddressProvided (withdrawal) {
    return "You must register a wallet address before making a withdrawal, or provide a wallet address as an additional argument"
  }


  /**
   * Gets called if ever a withdraw command is sent which provides the Tip Bot's own wallet address
   *
   * @param withdrawal {Withdraw}
   * @returns {Promise<void>}
   */
  async onWithdrawalReferenceError (withdrawal) {
    return `You're not allowed to send money through this interface to the tipping bot. If you'd like to tip the creators, check our repository on GitHub.`;
  }

  /**
   * Called when the Stellar SDK determines that the destination for a withdrawal doesn't yet actually exist.
   * Note that this is distinct from onWithdrawalInvalidAddress. You can have a valid address that doesn't exist.
   * @param withdrawal {Withdraw}
   * @returns {Promise<void>}
   */
  async onWithdrawalDestinationAccountDoesNotExist (withdrawal) {
    return `I could not complete your request. The address you tried to withdraw from does not exist.`;
  }

  /**
   * Called when the user submits a withdrawal but doesn't have enough XLM in balance to cover the amount.
   *
   * @param withdrawal {Withdraw} The withdraw command
   * @param balance The user's current balance in XLM
   * @returns {Promise<string>}
   */
  async onWithdrawalFailedWithInsufficientBalance (withdrawal, balance) {
    return `You requested to withdraw \`${Utils.formatNumber(withdrawal.amount)} XLM\` but your wallet only contains \`${Utils.formatNumber(balance)} XLM\``;
  }

  /**
   * Called when the user attempts to withdraw to an invalid address. Should only occur when supplying
   * a secondary wallet address, which is to say validation should prevent users from registering
   * an invalid address.
   *
   * @param withdrawal {Withdraw}
   * @returns {Promise<string>}
   */
  async onWithdrawalInvalidAddress (withdrawal) {
    return `\`${withdrawal.address}\` is not a valid public key. Please try again with a valid public key.`
  }

  /**
   * Gets called when there is a problem submitting the transaction to the Horizon server with the Stellar SDK.
   *
   * @param withdrawal {Withdraw}
   * @returns {Promise<void>}
   * // TODO: Implement this
   */
  async onWithdrawalSubmissionFailed (withdrawal) {
    return "Submission to horizon failed. There may be a problem with the Stellar network or Horizon. Try again later."
  }

  /**
   * Called when the user provides an invalid withdrawal amount, such as a string containing letters.
   *
   * @param withdrawal {Withdraw}
   * @returns {Promise<string>}
   */
  async onWithdrawalInvalidAmountProvided (withdrawal) {
    return `\`${withdrawal.amount}\` is not a valid withdrawal amount. Please try again.`
  }

  /**
   * Called when a user successfully withdraws any amount of XLM.
   *
   * @param withdrawal {Withdraw}
   * @param address {String}
   * @returns {Promise<string>}
   */
  async onWithdrawal (withdrawal, address, txHash) {
    return `You withdrew \`${withdrawal.amount} XLM\` to your wallet at \`${address}\`\n\nYour transaction hash is \`${txHash}\`\nYou can validate the transaction at: ${process.env.STELLAR_TX_VIEWER_URL_BASE}/${txHash}`;
  }

  /**
   *
   * Called when the public key address you're trying to withdraw to doesn't exist
   *
   * @param tipDevs {TipDevelopers}
   * @returns {String}
   */
  async onTipDevsDestinationAccountDoesNotExist (tipDevs) {
    // Override this or listen to events!
    return "Tip Devs Destination does not exist: " +   `${tipDevs.uniqueId} ${tipDevs.address} ${tipDevs.amount} ${tipDevs.hash}`;
  }

  /**
   *
   * Called when you try to withdraw with no address
   *
   * @param tipDevs {TipDevelopers}
   * @returns {String}
   */
  async onTipDevsNoAddressProvided (tipDevs) {
    // Override this or listen to events!
    return "The developers have not registered their address. How silly of us!"
  }

  /**
   *
   * Called when you try to make a withdraw with an invalid amount, such as "asdf"
   *
   * @param tipDevs {TipDevelopers}
   * @returns {String}
   */
  async onTipDevsInvalidAmountProvided (tipDevs) {
    // Override this or listen to events!
    return "Tip Devs Destination does not exist: " +   `${tipDevs.uniqueId} ${tipDevs.address} ${tipDevs.amount} ${tipDevs.hash}`;
  }

  /**
   *
   * Called when the user does not have a high enough balance to complete their tipDevs.
   * Balance is not part of the Command.Withdraw object's params. It is acquired via the Account class.
   *
   * @param tipDevs {TipDevelopers}
   * @param balance {Number}
   * @returns {String}
   */
  async onTipDevsFailedWithInsufficientBalance (tipDevs, balance) {
    // Override this or listen to events!
    return `You requested to send the developers \`${Utils.formatNumber(tipDevs.amount)} XLM\` but your wallet only contains \`${Utils.formatNumber(balance)} XLM\``;
  }

  /**
   * Called when, for any reason, we attempt to tip devs but sending the transaction to the Horizon server fails.
   * @param tipDevs {TipDevelopers}
   * @returns {String}
   */
  async onTipDevsSubmissionFailed (tipDevs) {
    // Override this or listen to events!
    return `Sending your transaction to Horizon failed. Please try again later.`;
  }

  /**
   * Called on a successfull tipDevs
   * @param tipDevs {TipDevelopers}
   * @param address {String} The address to which the tipDevs was made. Included here because the Withdraw command is not responsible for obtaining the wallet of the given user at the time it is created.
   * @returns {String}
   */
  async onTipDevs (tipDevs, address, txHash) {
    // Override this or listen to events!
    return `You tipped the devs ${tipDevs.amount} XLM. Thank you so much for your donation!`
  }

  /**
   * Routes a command depending on its class to the appropriate function
   *
   * @param command {Command}
   */
  handleCommand(command) {
    console.log(`Handling command: ${JSON.stringify(command)}`)
    if(!command) {
      return;
    }
    if(command instanceof Command.Register) {
      return this.handleRegistrationRequest(command);
    } else if (command instanceof Command.Balance) {
      return this.receiveBalanceRequest(command);
    } else if (command instanceof Command.Tip) {
      return this.receivePotentialTip(command);
    } else if (command instanceof Command.Withdraw) {
      return this.receiveWithdrawalRequest(command);
    } else if (command instanceof Command.Info) {
      return this.receiveInfoRequest(command);
    } else if (command instanceof Command.TipDevelopers) {
      return this.receiveTipDevelopersRequest(command);
    }
  }

  /**
   * Will transfer the tip provided if possible, otherwise will call the appropriate function on the adapter
   * in the event that there is an insufficient balance or other issue.
   * @param tip {Tip}
   * @returns {Promise<void>}
   */
  async receivePotentialTip (tip) {
    // Let's validate we can actually find a slack user given the tip command as provided, otherwise we abort
    try {
      let client = await this.getBotClientForCommand(tip)
      await client.getDMIdForUser(tip.targetId)
    } catch (e) {
      console.log(`${e}\nCould not find user ID in receivePotentialTip. Aborting tip`)
      this.getLogger().CommandEvents.onTipNoTargetFound(tip)
      return this.onTipNoTargetFound(tip)
    }
    return super.receivePotentialTip(tip)
  }

  /**
   * handleRegistrationRequest(command)
   *
   * @param command a Registration command object
   */
  async handleRegistrationRequest(command) {
    if (!(command.walletPublicKey && StellarSdk.StrKey.isValidEd25519PublicKey(command.walletPublicKey))) {
      this.getLogger().CommandEvents.onRegisteredWithBadWallet(command)
      return this.onRegistrationBadWallet(command.walletPublicKey)
    }

    if(command.walletPublicKey == process.env.STELLAR_PUBLIC_KEY) {
      this.getLogger().CommandEvents.onRegisteredWithRobotsWalletAddress(command)
      return `That is my address. You must register with your own address.`;
    }

    const usersExistingWallet = await this.Account.walletAddressForUser(command.adapter, command.sourceId)

    // If it's the same wallet, just send a message back
    if(usersExistingWallet && usersExistingWallet == command.walletPublicKey) {
      this.getLogger().CommandEvents.onRegisteredWithCurrentWallet(command)
      return this.onRegistrationSameAsExistingWallet(usersExistingWallet)
    }

    // Check to see if a user already exists with that wallet. If they do, send a message back to the user about it.
    const userWithWalletId = await this.Account.userForWalletAddress(command.walletPublicKey)
    if(userWithWalletId) {
      this.getLogger().CommandEvents.onRegisteredWithWalletRegisteredToOtherUser(command, userWithWalletId)
      return this.onRegistrationOtherUserHasRegisteredWallet(command.walletPublicKey)
    }

    // In the case where we are replacing an old wallet, we go ahead and replace it immediately
    if (usersExistingWallet) {
      return this.registerUser(command)
    }

    // Otherwise, we send them a terms confirmation message. Final registration is handled using callbacks from button pushes on that message. See server.js
    this.getLogger().CommandEvents.onRegistrationSentTermsAgreement(command)
    return this.getTermsAgreement(command)
  }

  async registerUser(registrationCommand) {
    const account = await this.Account.getOrCreate(registrationCommand.adapter, registrationCommand.sourceId)
    const usersExistingWallet = await this.Account.walletAddressForUser(registrationCommand.adapter, registrationCommand.sourceId)
    await account.setWalletAddress(registrationCommand.walletPublicKey)
    // Not their first time registering a wallet
    if(usersExistingWallet) {
      this.getLogger().CommandEvents.onRegisteredSuccessfully(registrationCommand, false)
      return this.onRegistrationReplacedOldWallet(usersExistingWallet, registrationCommand.walletPublicKey)
    } else {
      this.getLogger().CommandEvents.onRegisteredSuccessfully(registrationCommand, true)
      return await this.onRegistrationRegisteredFirstWallet(registrationCommand.walletPublicKey)
    }
  }

  /**
   * Called when the user registers a wallet for the first time i.e. they did not previously have a wallet address.
   *
   * @param walletAddress {String} The wallet address the user has registered.
   * @returns {Promise<string>}
   */
  async onRegistrationRegisteredFirstWallet(walletAddress) {
    return await this.getFirstTimeRegistrationMessage(walletAddress)
  }


  /**
   * Returns a JSON payload
   *
   * @param registrationCommand {Register}
   * @returns {Promise<string>}
   */
  getTermsAgreement(registrationCommand) {
    return JSON.parse('{\n' +
        '    "text": "*Disclaimer*",\n' +
        '    "attachments": [\n' +
        '        {\n' +
        '            "text": "1) This bot is not affiliated with the Stellar Development Foundation in any official capacity.\\n2) You should keep no more funds in this bot than you can afford to lose.\\n3) Lost funds will not be replaced. Use at your own discretion.",\n' +
        '            "fallback": "You are unable to choose a game",\n' +
        '            "callback_id": "terms_agreement",\n' +
        '            "color": "#00CC00",\n' +
        '            "attachment_type": "default",\n' +
        '            "actions": [\n' +
        '                {\n' +
        '                    "name": "confirm",\n' +
        '                    "text": "I Understand.",\n' +
        '                    "style": "primary",\n' +
        '                    "type": "button",\n' +
        '                    "value": ' + `${JSON.stringify(registrationCommand.serialize())}` + '\n' +
        '                },\n' +
        '                {\n' +
        '                    "name": "cancel",\n' +
        '                    "text": "Cancel.",\n' +
        '                    "style": "danger",\n' +
        '                    "type": "button",\n' +
        '                    "value": "false"\n' +
        '                }\n' +
        '            ]\n' +
        '        }\n' +
        '    ]\n' +
        '}')
  }


  /**
   *
   * @param sourceAccount The Account model which made the deposit
   * @param amount The amount in XLM of the deposit
   * @returns String
   */
  async onDeposit (sourceAccount, amount)
  {
    this.getLogger().CommandEvents.onDepositSuccess(sourceAccount, amount)
    this.getLogger().MessagingEvents.onDepositReceiptMessageSent(sourceAccount)
    let client = await this.getBotClientForUniqueId(sourceAccount.uniqueId)
    client.sendPlainTextDMToSlackUser(Utils.slackUserIdFromUniqueId(sourceAccount.uniqueId),
        `You made a deposit of ${Utils.formatNumber(amount)} XLM`);
  }

  /**
   *
   * @param cmd {Balance}
   * @returns String
   */
  async receiveBalanceRequest (cmd) {
    console.log("in Receive balance request");
    const account = await this.Account.getOrCreate(cmd.adapter, cmd.sourceId)
    let userIsRegistered = !!account.walletAddress
    this.getLogger().CommandEvents.onBalanceRequest(cmd, userIsRegistered)
    return this.getBalanceInfo(account)
  }

  /**
   *
   * @param cmd {Info}
   * @returns String
   */
  async receiveInfoRequest (cmd) {
    const account = await this.Account.getOrCreate(cmd.adapter, cmd.sourceId)
    // Use !! to hard convert to boolean
    this.getLogger().CommandEvents.onInfoRequest(cmd, !!account.walletAddress)
    return this.getBotInfo(!!account.walletAddress)
  }

  async receiveNewAuthTokensForTeam (team, authToken, botToken) {
    try {
      if (!authToken.length || !botToken.length) {
        this.getLogger().OAuthEvents.onOAuthAddEmptyOAuthToken('slack', {teamId: team})
        throw `Missing OAuth token for your team. Adding Starry to Slack failed. Please try again.`;
      }
      const newAuth = await this.slackAuth.getOrCreate(team, authToken, botToken);
      this.getLogger().OAuthEvents.onAddedNewAuthToken('slack', {teamId: team})
      return `Adding Starry to Slack succeeded. Open Slack to start tipping!`;
    } catch (exc) {
      this.getLogger().OAuthEvents.onAddingOAuthFailed('slack', {teamId: team}, exc)
      throw exc;
    }
  }

  /**
   * Just a passthrough to our static botClientForCommand constructor. Allows for better testing.
   * @param command {Command}
   * @returns {SlackClient}
   */
  async getBotClientForCommand (command) {
    return await slackClient.botClientForCommand(command)
  }

  /**
   * Just a passthrough to our static botClientForUniqueId constructor. Allows for better testing.
   * @param command {Command}
   * @returns {SlackClient}
   */
  async getBotClientForUniqueId (uniqueId) {
    return await slackClient.botClientForUniqueId(uniqueId)
  }


  getFirstTimeRegistrationMessage(walletAddress) {
    let obj = {
      "attachments": [
        {
          "text": "*Registered Successfully*",
          "fallback": "Registered successfully. Welcome to the tipping bot.",
          "color": "#36a64f",
          "fields": [
            {
              "title": "Your wallet address",
              "value": walletAddress,
              "short": false
            },
            {
              "title": "To deposit, send XLM to",
              "value": process.env.STELLAR_PUBLIC_KEY,
              "short": false
            },
            {
              "title": "To tip users",
              "value": "Use the /tip command",
              "short": false
            },
            {
              "title": "To check your balance",
              "value": "Use the /balance command",
              "short": false
            },
            {
              "title": "To withdraw",
              "value": "Use the /withdraw command",
              "short": false
            }
          ]
        }
      ]
    }
    return obj;
  }

  getBalanceInfo (account) {
    let userIsRegistered = !!account.walletAddress
    let obj = {
      "attachments": [
        {
          "fallback": "Information about your balance.",
          "color": "#36a64f",
          "fields": []
        }
      ]
    }
    if (userIsRegistered) {
      obj.attachments[0].fields = [
        {
          "title": "Your wallet address",
          "value": account.walletAddress,
          "short": false
        },
        {
          "title": "Your balance",
          "value": account.balance,
          "short": true
        },
        {
          "title": "To deposit, send XLM to",
          "value": process.env.STELLAR_PUBLIC_KEY,
          "short": false
        },
        {
          "title": "To tip users",
          "value": "Use the /tip command",
          "short": false
        }
      ]
    } else {
      obj.attachments[0].fields = [
        {
          "title": "You must register to have a balance",
          "value": "Use the /register command",
          "short": false
        }
      ]
    }
    return obj;
  }

  getBotInfo (userIsRegistered) {
    let obj = {
      "attachments": [{
        "fallback": "Required plain-text summary of the attachment.",
        "color": "#36a64f",
        "title": "Bot Info",
        "fields": [
          {
            "title": "Authors",
            "value": "@dlohnes and @dbulnes",
            "short": true
          },
          {
            "title": "Source and License",
            "value": "<" + process.env.GITHUB_URL + "|Github>",
            "short": true
          },
          {
            "title": "Network",
            "value": process.env.STELLAR_HORIZON,
            "short": true
          },
          {
            "title": "Disclaimer",
            "value": "This bot is not affiliated with the Stellar Development Foundation in any official capacity.\nYou should keep no more funds in this bot than you can afford to lose.\nLost funds will not be replaced. Use at your own discretion.",
            "short": false
          }
        ]
      }]
    }

    if(userIsRegistered) {
      // Add in the other field at array position 2
      obj.attachments[0].fields.splice(2, 0, {
        "title": "Send deposits to ",
        "value": process.env.STELLAR_PUBLIC_KEY,
        "short": false
      })
    }
    return obj
  }

  constructor (config) {
    super(config);
    this.name = 'slack';
    this.slackAuth = config.models.slackAuth;
  }

}

module.exports = Slack;