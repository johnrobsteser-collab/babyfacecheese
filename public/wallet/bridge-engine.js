/**
 * Bridge Engine - Cross-Chain Token Bridging
 * Allows transferring CHEESE tokens between native blockchain and other chains
 */

class BridgeEngine {
    constructor(blockchainAPI, founderIncome = null) {
        this.api = blockchainAPI;
        this.founderIncome = founderIncome;
        this.bridgeContracts = {
            // Real bridge contract addresses (update with actual deployed contracts)
            'BSC': '0x0000000000000000000000000000000000000000', // TODO: Deploy BSC bridge contract
            'ETH': '0x0000000000000000000000000000000000000000', // TODO: Deploy ETH bridge contract
            'POLYGON': '0x0000000000000000000000000000000000000000' // TODO: Deploy Polygon bridge contract
        };
        this.bridgeFee = 0.005; // 0.5% bridge fee (synced with DEX)
        this.minBridgeAmount = 10; // Minimum amount to bridge
        this.bridgeHistory = [];
        this.bscVerifier = null;
        this.initBSCVerifier();
    }

    // Initialize BSC verifier
    async initBSCVerifier() {
        try {
            // Load BSC verifier if available
            if (typeof BSCVerifier !== 'undefined') {
                this.bscVerifier = new BSCVerifier();
            } else {
                // Try to load from file
                const script = document.createElement('script');
                script.src = './bsc-verifier.js';
                script.onload = () => {
                    if (typeof BSCVerifier !== 'undefined') {
                        this.bscVerifier = new BSCVerifier();
                    }
                };
                document.head.appendChild(script);
            }
        } catch (error) {
            console.error('BSC verifier init error:', error);
        }
    }

    // Get supported chains
    getSupportedChains() {
        return [
            { id: 'BSC', name: 'Binance Smart Chain', icon: '🔵' },
            { id: 'ETH', name: 'Ethereum', icon: '💎' },
            { id: 'POLYGON', name: 'Polygon', icon: '🟣' }
        ];
    }

    // Calculate bridge fee
    calculateBridgeFee(amount) {
        return amount * this.bridgeFee;
    }

    // Calculate bridge amount (after fee)
    calculateBridgeAmount(amount) {
        const fee = this.calculateBridgeFee(amount);
        return {
            originalAmount: amount,
            fee: fee,
            netAmount: amount - fee,
            feePercent: this.bridgeFee * 100
        };
    }

    // Bridge tokens FROM native blockchain TO another chain
    async bridgeOut(amount, toChain, recipientAddress, walletAddress, privateKey) {
        try {
            // Validate amount
            if (amount < this.minBridgeAmount) {
                throw new Error(`Minimum bridge amount is ${this.minBridgeAmount} NCHEESE`);
            }

            // Validate balance
            const balance = await this.api.getBalance(walletAddress);
            if (balance < amount) {
                throw new Error('Insufficient balance');
            }

            // Calculate bridge details
            const bridgeCalc = this.calculateBridgeAmount(amount);

            // Create bridge transaction
            const bridgeTransaction = {
                type: 'bridge_out',
                from: walletAddress,
                to: this.bridgeContracts[toChain],
                amount: amount,
                toChain: toChain,
                recipientAddress: recipientAddress,
                fee: bridgeCalc.fee,
                netAmount: bridgeCalc.netAmount,
                timestamp: Date.now()
            };

            // Check if bridge contract is deployed
            if (this.bridgeContracts[toChain] === '0x0000000000000000000000000000000000000000') {
                // Bridge contract not deployed - lock tokens on native chain
                // In production, this would require deploying a bridge contract on destination chain
                const bridgeLockAddress = `BRIDGE_LOCK_${toChain}_${Date.now()}`;

                const result = await this.api.sendTransaction(
                    walletAddress,
                    bridgeLockAddress,
                    amount,
                    privateKey,
                    bridgeTransaction
                );

                if (result.success) {
                    this.bridgeHistory.push({
                        ...bridgeTransaction,
                        transactionHash: result.transaction?.id || result.transaction?.hash,
                        status: 'pending',
                        direction: 'out',
                        fromChain: 'CHEESE_NATIVE',
                        toChain: toChain,
                        bridgeLockAddress: bridgeLockAddress,
                        note: `Tokens locked. Deploy bridge contract on ${toChain} to complete transfer.`
                    });

                    this.saveBridgeHistory();

                    return {
                        success: true,
                        transaction: result,
                        bridgeDetails: bridgeCalc,
                        estimatedTime: this.getEstimatedBridgeTime(toChain),
                        warning: `Bridge contract not deployed on ${toChain}. Tokens are locked on native chain.`
                    };
                } else {
                    throw new Error(result.error || 'Bridge lock transaction failed');
                }
            } else {
                // Bridge contract exists - send net amount (after fee) to bridge contract
                const result = await this.api.sendTransaction(
                    walletAddress,
                    this.bridgeContracts[toChain],
                    bridgeCalc.netAmount,
                    privateKey,
                    bridgeTransaction
                );

                // Route bridge fee to founder wallet
                let feeTx = null;
                if (this.founderIncome && bridgeCalc.fee > 0) {
                    feeTx = await this.founderIncome.routeBridgeFee(
                        bridgeCalc.fee,
                        walletAddress,
                        privateKey,
                        result.transaction?.id || result.transaction?.hash
                    );
                }

                if (result.success) {
                    this.bridgeHistory.push({
                        ...bridgeTransaction,
                        transactionHash: result.transaction?.id || result.transaction?.hash,
                        status: 'pending',
                        direction: 'out',
                        fromChain: 'CHEESE_NATIVE',
                        toChain: toChain
                    });

                    this.saveBridgeHistory();

                    return {
                        success: true,
                        transaction: result,
                        feeTransaction: feeTx,
                        bridgeDetails: bridgeCalc,
                        estimatedTime: this.getEstimatedBridgeTime(toChain)
                    };
                } else {
                    throw new Error(result.error || 'Bridge transaction failed');
                }
            }
        } catch (error) {
            console.error('Bridge out error:', error);
            throw error;
        }
    }

    // Bridge tokens FROM another chain TO native blockchain
    async bridgeIn(amount, fromChain, transactionHash, recipientAddress) {
        try {
            // Step 1: Verify the transaction on the source chain
            let verification = null;

            if (fromChain === 'BSC') {
                // Verify BSC transaction
                if (!this.bscVerifier) {
                    await this.initBSCVerifier();
                }

                if (this.bscVerifier) {
                    try {
                        verification = await this.bscVerifier.verifyBSCTransaction(transactionHash);

                        if (!verification.verified) {
                            throw new Error('BSC transaction verification failed');
                        }

                        // Verify amount matches (with tolerance)
                        const verifiedAmount = verification.transaction.value;
                        const amountDiff = Math.abs(verifiedAmount - amount);
                        const tolerance = amount * 0.01; // 1% tolerance

                        if (amountDiff > tolerance) {
                            throw new Error(`Amount mismatch: Expected ${amount}, got ${verifiedAmount}`);
                        }

                        // Verify recipient if provided
                        if (recipientAddress) {
                            // For BSC, we check if the transaction was sent to bridge contract
                            // The actual recipient is set by the bridge contract
                            console.log('Recipient verification:', recipientAddress);
                        }
                    } catch (error) {
                        console.error('BSC verification error:', error);
                        // Try backend verification as fallback
                        try {
                            verification = await this.api.verifyBridgeTransaction(
                                fromChain,
                                transactionHash,
                                amount,
                                recipientAddress
                            );
                        } catch (backendError) {
                            throw new Error(`Transaction verification failed: ${error.message}`);
                        }
                    }
                } else {
                    // Fallback to backend verification
                    verification = await this.api.verifyBridgeTransaction(
                        fromChain,
                        transactionHash,
                        amount,
                        recipientAddress
                    );
                }
            } else {
                // For other chains, use backend verification
                verification = await this.api.verifyBridgeTransaction(
                    fromChain,
                    transactionHash,
                    amount,
                    recipientAddress
                );
            }

            if (!verification || !verification.verified) {
                throw new Error('Transaction verification failed');
            }

            // Step 2: Check if this transaction was already processed
            const existingBridge = this.bridgeHistory.find(
                b => b.sourceTransactionHash === transactionHash && b.status === 'completed'
            );

            if (existingBridge) {
                throw new Error('This transaction has already been processed');
            }

            // Step 3: Mint tokens on native blockchain
            let mintResult = null;
            try {
                mintResult = await this.api.mintTokens(recipientAddress, amount, 'bridge_in');

                if (!mintResult.success) {
                    throw new Error(mintResult.error || 'Token minting failed');
                }
            } catch (mintError) {
                console.error('Mint error:', mintError);
                // If minting fails, still create pending record for manual review
                const bridgeTransaction = {
                    type: 'bridge_in',
                    fromChain: fromChain,
                    toChain: 'CHEESE_NATIVE',
                    amount: amount,
                    recipientAddress: recipientAddress,
                    sourceTransactionHash: transactionHash,
                    timestamp: Date.now(),
                    status: 'pending',
                    error: mintError.message
                };

                this.bridgeHistory.push({
                    ...bridgeTransaction,
                    direction: 'in'
                });

                this.saveBridgeHistory();

                throw new Error(`Minting failed: ${mintError.message}. Record saved for manual review.`);
            }

            // Step 4: Create bridge-in record with completed status
            const bridgeTransaction = {
                type: 'bridge_in',
                fromChain: fromChain,
                toChain: 'CHEESE_NATIVE',
                amount: amount,
                recipientAddress: recipientAddress,
                sourceTransactionHash: transactionHash,
                nativeTransactionHash: mintResult.transactionHash || mintResult.transaction?.hash,
                timestamp: Date.now(),
                status: 'completed',
                verification: verification
            };

            this.bridgeHistory.push({
                ...bridgeTransaction,
                direction: 'in'
            });

            this.saveBridgeHistory();

            return {
                success: true,
                message: '✅ Bridge-in completed! Tokens minted successfully.',
                bridgeTransaction: bridgeTransaction,
                mintResult: mintResult
            };
        } catch (error) {
            console.error('Bridge in error:', error);

            // Create pending record for failed bridge-in
            const bridgeTransaction = {
                type: 'bridge_in',
                fromChain: fromChain,
                toChain: 'CHEESE_NATIVE',
                amount: amount,
                recipientAddress: recipientAddress,
                sourceTransactionHash: transactionHash,
                timestamp: Date.now(),
                status: 'failed',
                error: error.message
            };

            this.bridgeHistory.push({
                ...bridgeTransaction,
                direction: 'in'
            });

            this.saveBridgeHistory();

            throw error;
        }
    }

    // Get bridge status
    async getBridgeStatus(transactionHash) {
        try {
            // Check transaction status on blockchain
            const blockchain = await this.api.getBlockchainInfo();

            // Find transaction in blockchain
            let transaction = null;
            for (const block of blockchain.chain || []) {
                if (block.transactions) {
                    transaction = block.transactions.find(tx =>
                        tx.id === transactionHash || tx.hash === transactionHash
                    );
                    if (transaction) break;
                }
            }

            if (transaction) {
                return {
                    status: 'completed',
                    transaction: transaction,
                    confirmations: blockchain.chainLength - (transaction.blockIndex || 0)
                };
            }

            // Check pending transactions
            const pending = await this.api.getTransactionHistory();
            const pendingTx = pending.find(tx =>
                tx.id === transactionHash || tx.hash === transactionHash
            );

            if (pendingTx) {
                return {
                    status: 'pending',
                    transaction: pendingTx
                };
            }

            return {
                status: 'not_found',
                message: 'Transaction not found'
            };
        } catch (error) {
            console.error('Get bridge status error:', error);
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // Get estimated bridge time
    getEstimatedBridgeTime(chain) {
        const times = {
            'BSC': '5-10 minutes',
            'ETH': '10-15 minutes',
            'POLYGON': '5-10 minutes'
        };
        return times[chain] || '10-15 minutes';
    }

    // Get bridge history
    getBridgeHistory() {
        const saved = localStorage.getItem('bridgeHistory');
        if (saved) {
            this.bridgeHistory = JSON.parse(saved);
        }
        return this.bridgeHistory.sort((a, b) => b.timestamp - a.timestamp);
    }

    // Save bridge history
    saveBridgeHistory() {
        localStorage.setItem('bridgeHistory', JSON.stringify(this.bridgeHistory));
    }

    // Get bridge statistics
    getBridgeStats() {
        const history = this.getBridgeHistory();
        const stats = {
            totalBridges: history.length,
            totalBridged: 0,
            totalFees: 0,
            byChain: {},
            byDirection: {
                out: 0,
                in: 0
            }
        };

        history.forEach(bridge => {
            stats.totalBridged += bridge.amount || 0;
            stats.totalFees += bridge.fee || 0;

            const chain = bridge.direction === 'out' ? bridge.toChain : bridge.fromChain;
            stats.byChain[chain] = (stats.byChain[chain] || 0) + 1;

            stats.byDirection[bridge.direction] = (stats.byDirection[bridge.direction] || 0) + 1;
        });

        return stats;
    }

    // Verify bridge transaction (for bridge-in)
    async verifyBridgeTransaction(fromChain, transactionHash) {
        try {
            if (fromChain === 'BSC') {
                if (!this.bscVerifier) {
                    await this.initBSCVerifier();
                }

                if (this.bscVerifier) {
                    return await this.bscVerifier.verifyBSCTransaction(transactionHash);
                }
            }

            // Fallback: Use backend API
            return await this.api.verifyBridgeTransaction(fromChain, transactionHash);
        } catch (error) {
            console.error('Verify bridge transaction error:', error);
            throw error;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BridgeEngine;
}

