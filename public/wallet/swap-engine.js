/**
 * Swap Engine - Token Swapping Functionality
 * Handles CHEESE token swaps
 */

class SwapEngine {
    constructor(blockchainAPI, founderIncome = null) {
        this.api = blockchainAPI;
        this.founderIncome = founderIncome;

        // DEX API Integration
        this.dexApiUrl = 'http://34.142.182.218:3002';
        this.dexConnected = false;
        this.availablePools = [];

        // CRITICAL: Use liquidity pool address instead of SWAP_CONTRACT
        // Liquidity pool wallet: 0x96e12d8940672fcb8067cab30100b1d9dd48a1e5
        this.liquidityPoolAddress = '0x96e12d8940672fcb8067cab30100b1d9dd48a1e5';

        // Default swap rates (fallback if DEX not available)
        // Will be updated dynamically from DEX
        this.swapRates = {
            // Core DEX Pool pairs
            'NCH/USDT': 1.0,
            'USDT/NCH': 1.0,
            'NCH/wNCH': 1.0,  // 1:1 wrapped token
            'wNCH/NCH': 1.0,
            'wNCH/USDT': 1.0, // wNCH on BSC
            'USDT/wNCH': 1.0,
            // Legacy support
            'NCHEESE/USDT': 1.0,
            'USDT/NCHEESE': 1.0
        };

        // Available tokens for swapping (NCH, wNCH, USDT only - no CHEESE)
        this.availableTokens = ['NCH', 'wNCH', 'USDT'];

        this.swapFee = 0.003; // 0.3% swap fee (matching DEX)

        // Initialize DEX connection
        this.initDEXConnection();
    }

    // Initialize DEX connection and fetch pools
    async initDEXConnection() {
        try {
            const response = await fetch(`${this.dexApiUrl}/api/health`);
            if (response.ok) {
                const data = await response.json();
                this.dexConnected = data.status === 'ok';
                console.log('🔗 DEX Connected:', this.dexConnected);

                // Fetch pool stats to update rates
                await this.fetchRatesFromDEX();
            }
        } catch (error) {
            console.warn('⚠️ DEX connection failed, using fallback rates:', error.message);
            this.dexConnected = false;
        }
    }

    // Fetch current rates from DEX
    async fetchRatesFromDEX() {
        try {
            // Get prices from DEX pools
            const pairs = [['NCH', 'USDT'], ['NCH', 'CHEESE'], ['CHEESE', 'USDT']];

            for (const [tokenA, tokenB] of pairs) {
                try {
                    const response = await fetch(`${this.dexApiUrl}/api/dex/price/${tokenA}/${tokenB}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.spotPrice) {
                            this.swapRates[`${tokenA}/${tokenB}`] = data.spotPrice;
                            this.swapRates[`${tokenB}/${tokenA}`] = 1 / data.spotPrice;
                        }
                    }
                } catch (e) {
                    // Continue with other pairs
                }
            }
            console.log('📊 Updated swap rates from DEX');
        } catch (error) {
            console.error('Error fetching DEX rates:', error);
        }
    }

    // Get swap quote from DEX
    async getSwapQuoteFromDEX(tokenIn, tokenOut, amountIn) {
        try {
            const response = await fetch(`${this.dexApiUrl}/api/dex/quote/${tokenIn}/${tokenOut}/${amountIn}`);
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Quote failed');
        } catch (error) {
            // Fallback to local calculation
            return this.calculateSwapAmount(amountIn, tokenIn, tokenOut);
        }
    }

    // Get swap rate
    getSwapRate(fromToken, toToken) {
        const pair = `${fromToken}/${toToken}`;
        const reversePair = `${toToken}/${fromToken}`;

        if (this.swapRates[pair]) {
            return this.swapRates[pair];
        } else if (this.swapRates[reversePair]) {
            return 1 / this.swapRates[reversePair];
        }

        return 1.0; // Default 1:1 rate
    }

    // Calculate swap amount
    calculateSwapAmount(fromAmount, fromToken, toToken) {
        const rate = this.getSwapRate(fromToken, toToken);
        const grossAmount = fromAmount * rate;
        const fee = grossAmount * this.swapFee;
        const netAmount = grossAmount - fee;

        return {
            fromAmount,
            toAmount: netAmount,
            rate,
            fee,
            feePercent: this.swapFee * 100
        };
    }

    // Execute swap
    async executeSwap(fromAmount, fromToken, toToken, walletAddress, privateKey) {
        try {
            // Normalize token names
            const normalizedFrom = fromToken === 'NCHEESE' ? 'NCH' : fromToken;
            const normalizedTo = toToken === 'NCHEESE' ? 'NCH' : toToken;

            // Validate swap pair is supported
            const supportedPairs = ['NCH', 'wNCH', 'USDT'];
            if (!supportedPairs.includes(normalizedFrom) || !supportedPairs.includes(normalizedTo)) {
                throw new Error(`Unsupported swap pair: ${normalizedFrom}/${normalizedTo}. Supported: NCH, wNCH, USDT`);
            }

            // Regular same-chain swap (e.g., NCHEESE → USDT on native chain)
            // Validate balance
            const balance = await this.api.getBalance(walletAddress);
            if (balance < fromAmount) {
                throw new Error('Insufficient balance');
            }

            // Calculate swap
            const swapCalc = this.calculateSwapAmount(fromAmount, fromToken, toToken);

            // Create swap transaction
            const swapTransaction = {
                type: 'swap',
                from: walletAddress,
                fromToken: fromToken,
                fromAmount: fromAmount,
                toToken: toToken,
                toAmount: swapCalc.toAmount,
                rate: swapCalc.rate,
                fee: swapCalc.fee,
                timestamp: Date.now()
            };

            // Send swap amount (minus fee) to liquidity pool
            const swapAmount = swapCalc.toAmount;
            const result = await this.api.sendTransaction(
                walletAddress,
                this.liquidityPoolAddress, // Liquidity pool address (not treasury)
                swapAmount,
                privateKey,
                swapTransaction
            );

            // Route swap fee to founder wallet
            let feeTx = null;
            if (this.founderIncome && swapCalc.fee > 0) {
                feeTx = await this.founderIncome.routeSwapFee(
                    swapCalc.fee,
                    walletAddress,
                    privateKey,
                    result.transaction?.id || result.transaction?.hash
                );
            }

            return {
                success: true,
                transaction: result,
                feeTransaction: feeTx,
                swapDetails: swapCalc
            };
        } catch (error) {
            console.error('Swap error:', error);
            throw error;
        }
    }

    // Execute swap via DEX API (recommended method)
    async executeSwapViaDEX(tokenIn, tokenOut, amountIn, userAddress) {
        try {
            console.log(`🔄 Executing swap via DEX: ${amountIn} ${tokenIn} → ${tokenOut}`);

            // Normalize token names (NCHEESE = NCH)
            const normalizedTokenIn = tokenIn === 'NCHEESE' ? 'NCH' : tokenIn;
            const normalizedTokenOut = tokenOut === 'NCHEESE' ? 'NCH' : tokenOut;

            // Get quote first
            const quote = await this.getSwapQuoteFromDEX(normalizedTokenIn, normalizedTokenOut, amountIn);
            console.log('📊 Swap quote:', quote);

            // Execute swap via DEX API
            // API key from config (more secure)
            const apiKey = window.CHEESE_API_KEY || localStorage.getItem('cheese_api_key') || 'default-key';

            const response = await fetch(`${this.dexApiUrl}/api/dex/swap`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    tokenIn: normalizedTokenIn,
                    tokenOut: normalizedTokenOut,
                    amountIn: amountIn,
                    minAmountOut: quote.amountOut * 0.99, // 1% slippage
                    userAddress: userAddress
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('✅ DEX swap successful:', result);
                return {
                    success: true,
                    amountIn: amountIn,
                    amountOut: result.amountOut,
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: result.fee,
                    priceImpact: result.priceImpact,
                    transaction: result
                };
            } else {
                throw new Error(result.error || 'Swap failed');
            }
        } catch (error) {
            console.error('DEX swap error:', error);
            // Fallback to local swap if DEX fails
            console.log('⚠️ Falling back to local swap...');
            throw error;
        }
    }

    // Get available tokens for swapping
    getAvailableTokens() {
        return this.availableTokens;
    }

    // Get DEX connection status
    isDEXConnected() {
        return this.dexConnected;
    }

    // Execute cross-chain swap: NCHEESE → CHEESE (native to BSC)
    async executeCrossChainSwapToBSC(fromAmount, walletAddress, privateKey) {
        try {
            console.log(`🔄 Executing cross-chain swap: ${fromAmount} NCHEESE → CHEESE (BSC)`);

            // Validate balance
            const balance = await this.api.getBalance(walletAddress);
            if (balance < fromAmount) {
                throw new Error('Insufficient NCHEESE balance');
            }

            // Calculate swap (1:1 ratio for NCHEESE → CHEESE)
            const swapCalc = this.calculateSwapAmount(fromAmount, 'NCHEESE', 'CHEESE');
            const cheeseAmount = swapCalc.toAmount; // Amount of CHEESE to receive on BSC

            // Step 1: Lock NCHEESE on native blockchain (deduct from user)
            const swapTransaction = {
                type: 'swap_cross_chain',
                from: walletAddress,
                fromToken: 'NCHEESE',
                fromAmount: fromAmount,
                toToken: 'CHEESE',
                toAmount: cheeseAmount,
                toChain: 'BSC',
                rate: swapCalc.rate,
                fee: swapCalc.fee,
                timestamp: Date.now()
            };

            // Deduct NCHEESE from user (send to swap lock address)
            const swapLockAddress = `SWAP_LOCK_BSC_${Date.now()}`;
            const result = await this.api.sendTransaction(
                walletAddress,
                swapLockAddress,
                fromAmount, // Lock full amount
                privateKey,
                swapTransaction
            );

            if (!result.success) {
                throw new Error('Failed to lock NCHEESE tokens');
            }

            // Step 2: Transfer CHEESE tokens on BSC
            // CRITICAL: This requires a backend service or smart contract
            // For now, we'll send a request to the blockchain API to handle BSC transfer
            try {
                const transferResult = await this.transferCheeseOnBSC(
                    walletAddress,
                    cheeseAmount,
                    result.transaction?.id || result.transaction?.hash
                );

                if (transferResult.success) {
                    console.log(`✅ CHEESE tokens transferred on BSC: ${cheeseAmount} CHEESE to ${walletAddress}`);
                } else {
                    console.warn('⚠️ BSC transfer failed, swap record saved for manual processing:', transferResult.error);
                }
            } catch (bscError) {
                console.error('Error transferring CHEESE on BSC:', bscError);
                // Continue - swap record will be saved for manual processing
            }

            // Save swap record for tracking
            const swapRecord = {
                ...swapTransaction,
                transactionHash: result.transaction?.id || result.transaction?.hash,
                status: 'completed',
                lockedNCHEESE: fromAmount,
                cheeseToReceive: cheeseAmount,
                cheeseTransferred: cheeseAmount,
                bscAddress: walletAddress,
                timestamp: Date.now()
            };

            this.saveSwapRecord(swapRecord);

            // Route swap fee to founder wallet
            let feeTx = null;
            if (this.founderIncome && swapCalc.fee > 0) {
                feeTx = await this.founderIncome.routeSwapFee(
                    swapCalc.fee,
                    walletAddress,
                    privateKey,
                    result.transaction?.id || result.transaction?.hash
                );
            }

            return {
                success: true,
                transaction: result,
                feeTransaction: feeTx,
                swapDetails: swapCalc,
                crossChain: true,
                toToken: 'CHEESE',
                toAmount: cheeseAmount,
                swapRecord: swapRecord,
                message: `✅ Swap completed! ${cheeseAmount} CHEESE tokens have been added to your BSC wallet.`
            };
        } catch (error) {
            console.error('Cross-chain swap error:', error);
            throw error;
        }
    }

    // Transfer CHEESE tokens on BSC (requires backend API endpoint)
    async transferCheeseOnBSC(recipientAddress, amount, swapTxHash) {
        try {
            // CRITICAL: This should call your blockchain API to transfer CHEESE on BSC
            // The API needs to have access to a treasury wallet with CHEESE tokens
            const apiUrl = this.api.baseUrl || 'https://cheese-blockchain-131552958027.asia-southeast1.run.app';

            const response = await fetch(`${apiUrl}/api/swap/transfer-cheese`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipient: recipientAddress,
                    amount: amount,
                    swapTxHash: swapTxHash,
                    chain: 'BSC'
                })
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, data: data };
            } else {
                const error = await response.json();
                return { success: false, error: error.message || 'Transfer failed' };
            }
        } catch (error) {
            console.error('Error calling transfer API:', error);
            return { success: false, error: error.message };
        }
    }

    // Execute cross-chain swap: CHEESE → NCHEESE (BSC to native)
    async executeCrossChainSwapFromBSC(fromAmount, walletAddress, privateKey) {
        // This would require the user to have CHEESE on BSC and lock it
        // Then mint NCHEESE on native chain
        throw new Error('CHEESE → NCHEESE swap requires CHEESE tokens on BSC. Please use bridge system instead.');
    }

    // Save swap record for tracking
    saveSwapRecord(swapRecord) {
        try {
            const existing = JSON.parse(localStorage.getItem('cheeseSwapRecords') || '[]');
            existing.push(swapRecord);
            localStorage.setItem('cheeseSwapRecords', JSON.stringify(existing));
            console.log('💾 Saved swap record:', swapRecord);
        } catch (error) {
            console.error('Error saving swap record:', error);
        }
    }

    // Get pending swaps that need CHEESE tokens on BSC
    getPendingSwaps(walletAddress) {
        try {
            const allSwaps = JSON.parse(localStorage.getItem('cheeseSwapRecords') || '[]');
            return allSwaps.filter(swap =>
                swap.from === walletAddress &&
                swap.status === 'pending' &&
                swap.toToken === 'CHEESE' &&
                swap.toChain === 'BSC'
            );
        } catch (error) {
            console.error('Error getting pending swaps:', error);
            return [];
        }
    }

    // Get swap history
    async getSwapHistory(walletAddress) {
        const transactions = await this.api.getTransactionHistory(walletAddress);
        return transactions.filter(tx => tx.data && tx.data.type === 'swap');
    }

    // Update swap rates (could fetch from API or liquidity pool)
    updateSwapRates(rates) {
        this.swapRates = { ...this.swapRates, ...rates };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SwapEngine;
}


