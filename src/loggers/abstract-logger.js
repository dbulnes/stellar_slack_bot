const Command = require('../adapters/commands/command')
const EventEmitter = require('events');

class Logger {

  constructor() {

    this.MessagingEvents = {
      onTipReceivedMessageSent(tip, userIsRegistered) {
      },

      onDepositReceiptMessageSent(account) {
      }
    }

    this.OAuthEvents = {

      /**
       *
       * @param adapter {String} The adapter we are calling from
       * @param blob {Object} A package of key-value pairs that we want to add to the analytics call
       * @returns {Object}
       */
      getOAuthAnalyticsBase(adapter, blob) {
      },

      onOAuthAddEmptyOAuthToken(adapter, blob) {
      },

      onAddedNewAuthToken(adapter, blob) {
      },

      onAddingOAuthFailed(adapter, blob, exception) {
      },
    }

    this.CommandEvents = {

      events: new EventEmitter(),

      onTipWithInsufficientBalance(tip, balance) {
      },

      onTipTransferFailed(tip) {

      },

      onUserAttemptedToTipThemself(tip) {

      },

      onTipNoTargetFound(tip) {

      },

      onTipSuccess(tip, amount) {

      },

      onWithdrawalNoAddressProvided(withdrawal) {

      },

      onWithdrawalAttemptedToRobotTippingAddress(withdrawal) {

      },

      onWithdrawalDestinationAccountDoesNotExist(withdrawal) {

      },

      onWithdrawalInsufficientBalance(withdrawal, balance) {

      },

      onWithdrawalBadlyFormedAddress(withdrawal, badWalletAddress) {

      },

      onWithdrawalSubmissionToHorizonFailed(withdrawal) {

      },

      onWithdrawalDuplicateWithdrawalAttempted(withdrawal) {

      },

      onWithdrawalInvalidAmountProvided(withdrawal) {

      },

      onWithdrawalSuccess(withdrawal, address, txHash) {

      },

      onTipDevsNoAddressProvided(withdrawal) {

      },

      onTipDevsDestinationAccountDoesNotExist(withdrawal) {

      },

      onTipDevsInsufficientBalance(withdrawal, balance) {

      },

      onTipDevsBadlyFormedAddress(withdrawal, badWalletAddress) {

      },

      onTipDevsSubmissionToHorizonFailed(withdrawal) {

      },

      onTipDevsInvalidAmountProvided(withdrawal) {

      },

      onTipDevsSuccess(withdrawal, address, txHash) {

      },

      onDepositSuccess(sourceAccount, amount) {

      },

      onBalanceRequest(balanceCmd, userIsRegistered) {

      },

      onInfoRequest(infoCmd, userIsRegistered) {

      },

      onRegisteredWithBadWallet(registration) {

      },

      onRegisteredWithCurrentWallet(registration) {

      },

      onRegisteredWithWalletRegisteredToOtherUser(registration, otherUser) {

      },

      onRegisteredWithRobotsWalletAddress(registration) {

      },

      onRegisteredSuccessfully(registration, isFirstRegistration) {

      },

      onRegistrationSentTermsAgreement(registration) {

      },

      onRefundSucceeded(transactionBeingRefunded) {

      },

      onRefundFailed(transactionBeingRefunded, exception) {

      }

    }
  }

}

module.exports = Logger