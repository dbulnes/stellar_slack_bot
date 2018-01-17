const express     = require('express');
const app         = express();
const bodyParser  = require('body-parser');
const Adapter     = require('../abstract');
const slmessage   = require('./slack-message');
const slackUtils  = require('./slack-command-utils');
const slackClient = require('./slack-client');
const StellarSdk = require('stellar-sdk')

// Constants
const _REG_FAIL_WALLET_VALIDATION = "The provided wallet address is invalid"
const _REG_FAIL_SAME_WALLET = "The user has already registered with this wallet"
const _REG_FAIL_WALLET_ALREADY_REGISTERED = "Another user has already registered with that wallet"

function formatMessage(txt) {
  return txt +
      '\n\n\n\n' + `*This bot is in BETA Phase. Everything runs on the testnet. Do not send real XLM!*` +
      '\n\n\n\n' +
      `[Deposit](https://www.reddit.com/user/stellar_bot/comments/7o2ex9/deposit/) | ` +
      `[Withdraw](https://np.reddit.com/message/compose/?to=${process.env.REDDIT_USER}&subject=Withdraw&message=Amount%20XLM%0Aaddress%20here) | ` +
      `[Balance](https://np.reddit.com/message/compose/?to=${process.env.REDDIT_USER}&subject=Balance&message=Tell%20me%20my%20XLM%20Balance!) | ` +
      `[Help](https://www.reddit.com/user/stellar_bot/comments/7o2gnd/help/) | ` +
      `[Donate](https://www.reddit.com/user/stellar_bot/comments/7o2ffl/donate/) | ` +
      `[About Stellar](https://www.stellar.org/)`
}

class Slack extends Adapter {

  static get REG_FAIL_SAME_WALLET() {
    return _REG_FAIL_SAME_WALLET;
  }

  static get REG_FAIL_WALLET_VALIDATION() {
    return _REG_FAIL_WALLET_VALIDATION;
  }

  async onTipWithInsufficientBalance (tip, amount) {
    await callReddit('reply', formatMessage(`Sorry. I can not tip for you. Your balance is insufficient.`), tip.original)
  }

  async onTipTransferFailed(tip, amount) {
    await callReddit('reply', formatMessage(`Sorry. I can not tip for you. Your balance is insufficient.`), tip.original)
  }

  async onTipReferenceError (tip, amount) {
    await callReddit('reply', formatMessage(`While self love is encouraged, self tipping is not.`), tip.original)
  }

  async onTip (tip, amount) {
    // console.log(`Tip from ${tip.sourceId} to ${tip.targetId}.`)
    // await callReddit('reply', formatMessage(`Thank you. You tipped **${payment} XLM** to *${success.targetId}*.`), tip.original)
  }

  async onWithdrawalReferenceError (uniqueId, address, amount, hash) {
    // console.log(`XML withdrawal failed - unknown error for ${uniqueId}.`)
    // exeucte('composeMessage', {
    //   to: uniqueId,
    //   subject: 'XLM Withdrawal failed',
    //   text: formatMessage(`An unknown error occured. This shouldn't have happened. Please contact the bot.`)
    // })
  }

  async onWithdrawalDestinationAccountDoesNotExist (uniqueId, address, amount, hash) {
    // console.log(`XML withdrawal failed - no public address for ${uniqueId}.`)
    // await callReddit('composeMessage', {
    //   to: uniqueId,
    //   subject: 'XLM Withdrawal failed',
    //   text: formatMessage(`We could not withdraw. The requested public address does not exist.`)
    // })
  }

  async onWithdrawalFailedWithInsufficientBalance (uniqueId, address, amount, hash) {
    // console.log(`XML withdrawal failed - insufficient balance for ${uniqueId}.`)
    // await callReddit('composeMessage', {
    //   to: address,
    //   subject: 'XLM Withdrawal failed',
    //   text: formatMessage(`We could not withdraw. You requested more than your current balance. Please adjust and try again.`)
    // })
  }

  async onWithdrawalInvalidAddress (uniqueId, address ,amount, hash) {
    // console.log(`XLM withdrawal failed - invalid address ${address}.`)
    // await callReddit('composeMessage', {
    //   to: address,
    //   subject: 'XLM Withdrawal failed',
    //   text: formatMessage(`We could not withdraw. The given address is not valid.`)
    // })
  }

  async onWithdrawalSubmissionFailed (uniqueId, address, amount, hash) {
    this.emit('withdrawalSubmissionFailed ', uniqueId, address, amount, hash)
  }

  async onWithdrawal (uniqueId, address, amount, hash) {
    // await callReddit('composeMessage', {
    //   to: uniqueId,
    //   subject: 'XLM Withdrawal',
    //   text: formatMessage(`Thank's for your request. ${amount} XLM are on their way to ${address}.`)
    // })
  }


  /**
   * handleRegistrationRequest(msg, res)
   *
   * @param msg an SLMessage derived from the original request object
   */
  async handleRegistrationRequest(msg) {

    if (!(msg.walletPublicKey && StellarSdk.StrKey.isValidEd25519PublicKey(msg.walletPublicKey))) {
      return this.onRegistrationBadWallet(msg.walletPublicKey)
    }

    // If the user is already registered, send them a message back explaining (and what their Wallet Address is)
    const usersExistingWallet = await this.Account.walletAddressForUser(msg.adapter, msg.sourceId)

    // If it's the same wallet, just send a message back
    if(usersExistingWallet && usersExistingWallet == msg.walletPublicKey) {
      return this.onRegistrationSameAsExistingWallet(usersExistingWallet)
    }

    // Check to see if a user already exists with that wallet
    const userWithWalletId = await this.Account.userForWalletAddress(msg.walletPublicKey)
    if(userWithWalletId) {
      return this.onRegistrationOtherUserHasRegisteredWallet(msg.walletPublicKey)
    }

    // In both remaining cases, we save the new wallet
    const account = await this.Account.getOrCreate(msg.adapter, msg.sourceId)
    await account.setWalletAddress(msg.walletPublicKey)

    // If we replaced an old wallet, send the appropriate message
    if (usersExistingWallet) {
      return this.onRegistrationReplacedOldWallet(usersExistingWallet, msg.walletPublicKey)
    } else {
      // Otherwise, we've simply saved the user's first wallet
      return this.onRegistrationRegisteredFirstWallet(msg.walletPublicKey)
    }
  }


  constructor (config) {
    super(config);

  }

  extractTipAmount (tipText) {
    const matches =  tipText.match(/\+\+\+([\d\.]*)[\s{1}]?XLM/i)
    if (matches) {
      return matches[1]
    }
    return undefined
  }
}

module.exports = Slack;