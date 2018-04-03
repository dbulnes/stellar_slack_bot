const assert = require('assert')
const Adapter = require('../src/adapters/abstract')
const Big = require('big.js')
const Utils = require('../src/utils')
const Command = require('../src/adapters/commands/command');
const sinon = require('sinon')
const Logger = require('../src/loggers/abstract-logger')

let Account;

describe('adapter', async () => {

  let adapter;
  let accountWithWallet;
  beforeEach(async () => {
    const config = await require('./setup')()
    adapter = new Adapter(config)
    var logger = new Logger();
    adapter.getLogger = function() {
      return logger
    }
    Account = adapter.config.models.account;
    // Require again so that we re-get the new Account stuff
    accountWithWallet = await Account.createAsync({
      adapter: 'testing',
      uniqueId: 'goodwallet',
      balance: '1.0000000',
      walletAddress: 'GDO7HAX2PSR6UN3K7WJLUVJD64OK3QLDXX2RPNMMHI7ZTPYUJOHQ6WTN'
    })
  })

  describe('deposit', () => {
    it ('should call onDeposit when the adapter is correct', (done) => {
      const Account = adapter.config.models.account;

      adapter.on('deposit', () => done())
      adapter.name = 'testing'

      Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then((account) => Account.events.emit('DEPOSIT', account, new Big('50')))
    })

    it ('should not call onDeposit when the adapter is incorrect', () => {
      const Account = adapter.config.models.account

      adapter.on('deposit', () => { throw new Error() })
      adapter.name = 'testing'

      Account.createAsync({
        adapter: 'foo',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then((account) => Account.events.emit('DEPOSIT', account, '50'))
    })
  })

  // describe('refund', () => {
  //   it ('should call onRefund when a transaction refund event is emitted', (done) => {
  //     const Account = adapter.config.models.account;

  //     adapter.on('REFUND', () => done())
  //     adapter.name = 'testing'

  //     Transaction.createAsync({
  //       memoId: "",
  //       amount: record.amount,
  //       createdAt: new Date(record.created_at),
  //       asset: record.asset_type,
  //       cursor: record.paging_token,
  //       source: record.from,
  //       target: record.to,
  //       hash: record.transaction_hash,
  //       type: 'deposit'
  //     }).then((transaction) => Transaction.events.emit('REFUND', transaction))
  //   })
  // })

  describe('receiveWithdrawalRequest', () => {

    it (`should call withdrawalNoAddressProvided if no address is given and the account doesn't have an address on file in the db`, (done) => {
      adapter.on('withdrawalNoAddressProvided', () => done())
      adapter.receiveWithdrawalRequest(new Command.Withdraw('testing', 'foo', '666'))
    })

    it ('should call withdrawalInvalidAddress if invalid address is given', (done) => {
      adapter.on('withdrawalInvalidAddress', () => done())
      adapter.receiveWithdrawalRequest({
        adapter: 'testing',
        amount: '666',
        uniqueId: 'foo',
        hash: 'bar',
        // someone gave her secret away :-(
        address: 'SBEZDGJO5WYUKVCSE44MANQCJCNOVBPOBJF4RNSAQGKQVTYKOTRUSRNH'
      })
    })

    it ('should call withdrawalFailedWithInsufficientBalance if withdrawal exceed balance', (done) => {
      adapter.on('withdrawalFailedWithInsufficientBalance', () => done())
      adapter.receiveWithdrawalRequest(new Command.Withdraw('testing', 'foo', '666', 'GA2B3GCDNVMANF4TT44KJNYU7TBVTKWY5XWF3Q3BJAPXRPBHXAEIFGBD'))
    })

    it ('should call withdrawalReferenceError if transaction goes to bot account', (done) => {
      adapter.on('withdrawalReferenceError', async () => {
        // account should be refunded
        const account = await Account.getOrCreate('testing', 'foo')
        assert.equal('5.0000000', account.balance)
        done()
      })
      const Transaction = adapter.config.models.transaction
      const Account = adapter.config.models.account
      const source = 'GAKLZ3CMOEMLZWO4EKXLIRDQSZ6XQMNGWCMRSDBJFQITD2TZXYTHBU4X'
      const target = 'GAKLZ3CMOEMLZWO4EKXLIRDQSZ6XQMNGWCMRSDBJFQITD2TZXYTHBU4X'
      const now = new Date()

      Account.withinTransaction(() => {
        return Account.createAsync({
          adapter: 'testing',
          uniqueId: 'foo',
          balance: '5.0000000'
        })
      }).then(() => {
        adapter.config.stellar = {
          createTransaction: () => new Promise((res, rej) => {
            return rej('TRANSACTION_REFERENCE_ERROR')
          })
        }
        let cmd = new Command.Withdraw('testing', 'foo', '5', target)
        adapter.receiveWithdrawalRequest(cmd)
      })
    })

    it ('should call withdrawalDestinationAccountDoesNotExist if transaction goes to non existing account', (done) => {
      adapter.on('withdrawalDestinationAccountDoesNotExist', async () => {
        // account should be refunded
        const account = await Account.getOrCreate('testing', 'foo')
        assert.equal('5.0000000', account.balance)
        done()
      })
      const Transaction = adapter.config.models.transaction
      const Account = adapter.config.models.account
      const source = 'GAKLZ3CMOEMLZWO4EKXLIRDQSZ6XQMNGWCMRSDBJFQITD2TZXYTHBU4X'
      const target = 'GA2B3GCDNVMANF4TT44KJNYU7TBVTKWY5XWF3Q3BJAPXRPBHXAEIFGBD'
      const now = new Date()

      Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then(() => {
        adapter.config.stellar = {
          createTransaction: () => new Promise((res, rej) => {
            return rej('DESTINATION_ACCOUNT_DOES_NOT_EXIST')
          })
        }
        let  cmd = new Command.Withdraw('testing', 'foo', '5', target)
        adapter.receiveWithdrawalRequest(cmd)
      })
    })

    it ('refund is performed if transaction already exists', (done) => {
      const Transaction = adapter.config.models.transaction
      const Account = adapter.config.models.account
      const source = 'GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB'
      const target = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q723BM2OARMDUYEJ5'
      const theHash = 'hash'
      const now = new Date()

      Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then(() => {
        Transaction.createAsync({
          memoId: 'XLM Tipping bot',
          amount: '5',
          asset: 'native',
          hash: theHash,
          type: 'withdrawal',
          target: target,
          source: source
        }).then(async () => {
          adapter.config.stellar = {
            address: source,
            createTransaction: () => {}
          }
          let cmd = new Command.Withdraw('testing', 'foo', '5', target, theHash)
          await adapter.receiveWithdrawalRequest(cmd)

          // account should be refunded
          const account = await Account.getOrCreate('testing', 'foo')
          assert.equal('5.0000000', account.balance)
          done()
        })
      })
    })

    it ('should refund withdrawalSubmissionFailed if transaction send fails, and log the horizon failure', (done) => {
      var spy = sinon.spy(adapter.getLogger().CommandEvents, "onWithdrawalSubmissionToHorizonFailed")

      const Transaction = adapter.config.models.transaction
      const Account = adapter.config.models.account
      const source = 'GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB'
      const target = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q723BM2OARMDUYEJ5'
      const now = new Date()

      Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then(() => {
        adapter.config.stellar = {
          address: source,
          createTransaction: () => {},
          send: () => {
            throw 'WITHDRAWAL_SUBMISSION_FAILED'
          }
        }
        let cmd = new Command.Withdraw('testing', 'foo', '5', target)

        adapter.on('withdrawalSubmissionFailed', async () => {
          // account should be refunded
          const account = await Account.getOrCreate('testing', 'foo')
          assert.equal('5.0000000', account.balance)
          assert(spy.withArgs(cmd).calledOnce)
          done()
        })

        adapter.receiveWithdrawalRequest(cmd)
      })
    })

    it ('should perform a withdrawal and create action', (done) => {
      const Transaction = adapter.config.models.transaction
      const Account = adapter.config.models.account
      const Action = adapter.config.models.action

      adapter.on('withdrawal', async () => {
        // account should be refunded
        const account = await Account.getOrCreate('testing', 'foo')
        const action = await Action.oneAsync({type: 'withdrawal', sourceaccount_id: account.id})
        assert.equal('0.0000000', account.balance)

        assert.equal('5.0000000', action.amount)
        assert.equal('GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q723BM2OARMDUYEJ5', action.address)
        done()
      })

      const source = 'GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB'
      const target = 'GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6Q723BM2OARMDUYEJ5'
      const now = new Date()

      Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then(async () => {
        adapter.config.stellar = {
          address: source,
          createTransaction: () => {},
          send: () => {}
        }
        let cmd = new Command.Withdraw('testing', 'foo', '5', target)
        // Verify an Action with our given paremeters doesn't yet exist
        const Action = adapter.config.models.action
        let acc = await cmd.getSourceAccount();
        const action = await Action.oneAsync({type: 'withdrawal', sourceaccount_id: acc.id})
        assert.notEqual(acc, null) // Our account should exist by this point
        assert.equal(action, null) // But our withdrawal Action from that account should not
        adapter.receiveWithdrawalRequest(cmd)
      })
    })
  })

  describe('receivePotentialTip', () => {

    it ('should call onTipWithInsufficientBalance if source cant pay', (done) => {
      let tip = new Command.Tip('testing', 'foo', 'target', '1.12')
      adapter.on('tipWithInsufficientBalance', () => done())
      adapter.receivePotentialTip(tip)
    })

    it ('should reject with onTipReferenceError if one tips herself', (done) => {
      adapter.Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then(() => {
        let tip = new Command.Tip('testing', 'foo', 'foo', '1')
        adapter.on('tipReferenceError', () => done())
        adapter.receivePotentialTip(tip)
      })
    })

    it ('should not do anything if hash already exists', async() => {
      source = await adapter.Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      })
      await adapter.config.models.action.createAsync({
        amount: '1.0000000',
        type: 'transfer',
        sourceaccount_id: source.id,
        hash: 'hash'
      })

      let tip = new Command.Tip('testing', 'foo', 'bar', '1')
      tip.hash = 'hash'

      await adapter.receivePotentialTip(tip)

      source = await adapter.Account.oneAsync({adapter: 'testing', uniqueId: 'foo'})
      target = await adapter.Account.oneAsync({adapter: 'testing', uniqueId: 'bar'})
      actionCount = await adapter.config.models.action.countAsync()

      assert.equal(source.balance, '5.0000000')
      assert.equal(target.balance, '0.0000000')
      assert.equal(actionCount, 1)
    })

    it ('should transfer money, create action and call with onTip', (done) => {
      adapter.Account.createAsync({
        adapter: 'testing',
        uniqueId: 'foo',
        balance: '5.0000000'
      }).then(() => {
        let tip = new Command.Tip('testing', 'foo', 'bar', '1')

        adapter.on('tip', async (tip, amount) => {
          assert.equal('1.0000000', amount)

          source = await adapter.Account.oneAsync({adapter: 'testing', uniqueId: 'foo'})
          target = await adapter.Account.oneAsync({adapter: 'testing', uniqueId: 'bar'})
          action = await adapter.config.models.action.oneAsync({sourceaccount_id: source.id, hash: tip.hash, type: 'transfer'})

          assert.equal(source.balance, '4.0000000')
          assert.equal(target.balance, '1.0000000')

          assert.equal(action.targetaccount_id, target.id)
          assert.equal(action.sourceaccount_id, source.id)
          assert.equal(action.amount, '1.0000000')
          assert.equal(action.type, 'transfer')
          assert.equal(action.hash, tip.hash)

          done()
        })
        adapter.receivePotentialTip(tip)
      })
    })
  })

  describe('setAccountOptions', () => {
    it ('should return an object containing the publc wallet address if the address is valid', () => {
      let desiredWalletAddress = "GDTWLOWE34LFHN4Z3LCF2EGAMWK6IHVAFO65YYRX5TMTER4MHUJIWQKB"
      let optionsObj = { walletAddress : desiredWalletAddress }
      let filteredOptions = adapter.setAccountOptions(optionsObj)
      assert.equal(filteredOptions.walletAddress, desiredWalletAddress, "Wallet address should be the same as it was when it came in")
    })

    it ('should throw an error if you provide an invalid wallet address', (done) => {
      let desiredWalletAddress = "badaddress"
      let optionsObj = { walletAddress : desiredWalletAddress }

      try {
        let filteredOptions = adapter.setAccountOptions(optionsObj)
      } catch (e) {
        done()
      }
    })
  })

})
