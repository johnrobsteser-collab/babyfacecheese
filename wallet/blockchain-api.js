/**
 * Cheese Blockchain API Client
 * Connects to the native Cheese Blockchain API
 */

class CheeseBlockchainAPI {
    constructor(apiUrl, apiKey) {
        // Production blockchain server URL (Railway)
        const productionUrl = 'https://ideal-quietude-production-22a8.up.railway.app';
        // Local development URL
        const localDevUrl = 'http://localhost:3000';

        // Auto-detect environment: use localhost for local dev, production for deployed
        const isLocalDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        const defaultUrl = isLocalDev ? localDevUrl : productionUrl;

        this.apiUrl = apiUrl || defaultUrl;
        this.apiKey = apiKey || '154db3748b7be24621d9f6a8e90619e150f865de65d72e979fbcbe37876afbf8';

        // Log which environment we're using
        console.log(`🌐 Environment: ${isLocalDev ? 'LOCAL DEV' : 'PRODUCTION'}`);
        console.log('✅ Blockchain API initialized with URL:', this.apiUrl);
    }


    async request(endpoint, options = {}) {
        // CRITICAL: Add API key to query params for mobile compatibility
        // Some mobile browsers have issues with custom headers
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${this.apiUrl}${endpoint}${separator}apiKey=${this.apiKey}`;

        // CRITICAL: Log the full URL to debug
        console.log('ðŸ” API Request:', url);

        // CRITICAL: Ensure we're not calling wallet server
        // DISABLED FOR LOCAL DEV: Allow localhost blockchain server
        /*
        if (url.includes('cheese-wallet') || url.includes('localhost')) {
            console.error('❌ ERROR: Attempting to call wallet server instead of blockchain server!');
            console.error('❌ URL:', url);
            console.error('❌ API URL:', this.apiUrl);
            throw new Error('Invalid API URL: Cannot call wallet server for blockchain API');
        }
        */

        const headers = {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add timeout handling (default 30 seconds, configurable via options.timeout)
        const timeout = options.timeout || 30000; // 30 seconds default
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn(`â±ï¸ Request timeout after ${timeout}ms: ${endpoint}`);
            controller.abort();
        }, timeout);

        try {
            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorData;
                let errorText = '';
                try {
                    errorText = await response.text();
                    console.error('âŒ API Error Response Text:', errorText);
                    errorData = errorText ? JSON.parse(errorText) : { error: response.statusText };
                } catch (e) {
                    console.error('âŒ Failed to parse error response:', e);
                    errorData = { error: errorText || response.statusText || 'Unknown error' };
                }

                const errorMessage = errorData.error || errorData.reason || errorData.message || errorText || `HTTP ${response.status}`;
                console.error('âŒ API Error Details:', {
                    status: response.status,
                    statusText: response.statusText,
                    endpoint: endpoint,
                    errorMessage: errorMessage,
                    fullError: errorData,
                    rawResponse: errorText
                });
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);

            // Check if it's a timeout/abort error
            if (error.name === 'AbortError' || error.message.includes('aborted')) {
                const timeoutError = new Error(`Request timeout after ${timeout}ms. The server may be slow or unavailable. Please try again.`);
                timeoutError.name = 'TimeoutError';
                console.error('â±ï¸ Request timeout:', endpoint);
                throw timeoutError;
            }

            console.error('API Request Error:', error);
            // Provide more helpful error messages
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Cannot connect to blockchain server. Please check your internet connection.');
            }
            throw error;
        }
    }

    // Wallet Operations
    async createWallet(password = null) {
        return await this.request('/api/wallet/create', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    }

    async loadWallet(address, password = null) {
        return await this.request('/api/wallet/load', {
            method: 'POST',
            body: JSON.stringify({ address, password })
        });
    }

    async getBalance(address) {
        try {
            console.log('ðŸ” API: Fetching balance for address:', address);
            const result = await this.request(`/api/balance/${address}`);
            console.log('ðŸ” API: Balance response:', result);

            // CRITICAL FIX: Extract balance from response object
            let balance;
            if (typeof result === 'object' && result !== null) {
                // Response is an object with balance property
                balance = result.balance;
            } else if (typeof result === 'number') {
                // Response is directly a number
                balance = result;
            } else {
                // Fallback
                balance = 0;
            }

            // Ensure balance is a number
            if (typeof balance !== 'number' || isNaN(balance)) {
                console.warn('âš ï¸ API: Balance is not a number, converting:', balance);
                balance = parseFloat(balance) || 0;
            }

            console.log('ðŸ” API: Extracted balance:', balance, 'Type:', typeof balance);
            return balance;
        } catch (error) {
            console.error('âŒ API: Error fetching balance:', error);
            throw error;
        }
    }

    // Transaction Operations
    async sendTransaction(from, to, amount, privateKey, data = {}) {
        // Log IMMEDIATELY - first thing in function
        console.log('ðŸ“¤ ========== BLOCKCHAIN API: sendTransaction() CALLED ==========');
        console.log('ðŸ“¤ Function entry point reached');
        console.log('ðŸ“¤ Parameters received:', {
            from: from ? from.substring(0, 10) + '...' : 'null',
            to: to ? to.substring(0, 10) + '...' : 'null',
            amount: amount,
            hasPrivateKey: !!privateKey,
            privateKeyLength: privateKey ? privateKey.length : 0,
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : []
        });
        console.log('ðŸ“¤ About to create transactionData...');

        // SECURITY: Sign transaction client-side (private key never leaves client)
        // Generate signature using private key
        const transactionData = {
            from,
            to,
            amount,
            timestamp: Date.now(),
            data: data || {}
        };

        console.log('ðŸ“¤ Transaction data created:', {
            from: transactionData.from,
            to: transactionData.to,
            amount: transactionData.amount,
            timestamp: transactionData.timestamp
        });

        // Create signature in blockchain format
        console.log('ðŸ“¤ Calling signTransaction()...');
        console.log('ðŸ“¤ signTransaction function exists?', typeof this.signTransaction === 'function');

        // Add timeout wrapper to prevent infinite hanging
        const signTimeout = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('signTransaction() timed out after 30 seconds - elliptic library may be hanging'));
            }, 30000);
        });

        let signature;
        try {
            console.log('ðŸ“¤ About to await signTransaction()...');
            signature = await Promise.race([
                this.signTransaction(transactionData, privateKey),
                signTimeout
            ]);
            console.log('âœ… signTransaction() completed');
            console.log('ðŸ“¤ Signature created:', {
                hasR: !!signature.r,
                hasS: !!signature.s,
                hasPublicKey: !!signature.publicKey,
                publicKeyLength: signature.publicKey ? signature.publicKey.length : 0
            });
        } catch (signError) {
            console.error('âŒ signTransaction() FAILED:', signError);
            console.error('âŒ Sign error message:', signError.message);
            console.error('âŒ Sign error name:', signError.name);
            console.error('âŒ Sign error stack:', signError.stack);
            throw signError;
        }

        // Send transaction with signature (NOT private key)
        // CRITICAL: Include timestamp so server can verify signature correctly
        console.log('ðŸ“¤ Creating request body...');
        const requestBody = {
            from,
            to,
            amount,
            signature, // Send signature object, not private key
            data: transactionData.data,
            timestamp: transactionData.timestamp // Include timestamp for signature verification
        };

        console.log('âœ… Request body created');
        console.log('ðŸ“¤ Request body details:', {
            from: requestBody.from,
            to: requestBody.to,
            amount: requestBody.amount,
            timestamp: requestBody.timestamp,
            hasSignature: !!requestBody.signature,
            signatureR: requestBody.signature?.r ? requestBody.signature.r.substring(0, 20) + '...' : 'missing',
            signatureS: requestBody.signature?.s ? requestBody.signature.s.substring(0, 20) + '...' : 'missing',
            publicKeyLength: requestBody.signature?.publicKey ? requestBody.signature.publicKey.length : 'missing'
        });

        // Use longer timeout for transactions (60 seconds)
        try {
            console.log('ðŸ“¤ ========== BLOCKCHAIN API: Making request ==========');
            console.log('ðŸ“¤ API URL:', `${this.apiUrl}/api/transaction`);
            console.log('ðŸ“¤ Request body keys:', Object.keys(requestBody));
            console.log('ðŸ“¤ Request body preview:', {
                from: requestBody.from,
                to: requestBody.to,
                amount: requestBody.amount,
                hasSignature: !!requestBody.signature,
                hasPublicKey: !!requestBody.signature?.publicKey,
                timestamp: requestBody.timestamp
            });

            console.log('ðŸ“¤ Calling this.request()...');
            const response = await this.request('/api/transaction', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                timeout: 60000 // 60 seconds for transaction processing
            });
            console.log('âœ… this.request() completed successfully');
            console.log('âœ… API response received:', response);
            return response;
        } catch (error) {
            console.error('âŒ ========== BLOCKCHAIN API: REQUEST FAILED ==========');
            console.error('âŒ Error type:', error.constructor.name);
            console.error('âŒ Error message:', error.message);
            console.error('âŒ Error name:', error.name);
            console.error('âŒ Error stack:', error.stack);
            console.error('âŒ Full error object:', error);
            throw error;
        }
    }

    // Recover Legacy Assets (Auto-Migration)
    async recoverLegacyAssets(privateKey) {
        console.log('🔄 Calling Legacy Recovery API...');
        return await this.request('/api/recover-legacy', {
            method: 'POST',
            body: JSON.stringify({ privateKey }),
            timeout: 60000 // Long timeout for BSC scanning
        });
    }

    // Sign transaction data with private key (matches blockchain format)
    async signTransaction(transactionData, privateKey) {
        console.log('ðŸ“¤ ========== signTransaction() ENTRY POINT ==========');
        console.log('ðŸ“¤ signTransaction called with:', {
            hasTransactionData: !!transactionData,
            hasPrivateKey: !!privateKey,
            privateKeyLength: privateKey ? privateKey.length : 0
        });

        // Use elliptic curve cryptography (secp256k1) to match blockchain
        // Load elliptic library dynamically if needed
        console.log('ðŸ“¤ Checking window.elliptic...');
        console.log('ðŸ“¤ typeof window:', typeof window);
        console.log('ðŸ“¤ window.elliptic exists?', typeof window !== 'undefined' && !!window.elliptic);

        // LOCAL FILE APPROACH: Wait for elliptic.js to load from same origin (no CDN issues)
        if (typeof window !== 'undefined' && !window.elliptic) {
            console.log('ðŸ“¤ Elliptic not loaded yet, waiting for local file to load...');

            // Check if script is in HTML
            const ellipticScript = document.querySelector('script[src*="elliptic"]');
            if (ellipticScript) {
                console.log(`ðŸ“¤ Found elliptic script tag: ${ellipticScript.src}`);
                console.log(`ðŸ“¤ Script readyState: ${ellipticScript.readyState || 'not set'}`);
            } else {
                console.log('ðŸ“¤ No elliptic script tag found in HTML');
            }

            // Wait up to 15 seconds for the local file to load
            console.log('ðŸ“¤ Waiting for elliptic library to load from local file (up to 15 seconds)...');
            let loaded = false;
            for (let i = 0; i < 150; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));

                // Check if elliptic is now available (try multiple ways)
                if (typeof window !== 'undefined') {
                    if (window.elliptic) {
                        console.log(`âœ… Elliptic library loaded after ${(i + 1) * 100}ms`);
                        loaded = true;
                        break;
                    }
                    // Also check if it's available via different names
                    if (window.ellipticjs || window.Elliptic) {
                        console.log(`âœ… Found elliptic under alternative name, assigning to window.elliptic`);
                        window.elliptic = window.ellipticjs || window.Elliptic;
                        loaded = true;
                        break;
                    }
                }

                // Every 2 seconds, log progress
                if ((i + 1) % 20 === 0) {
                    console.log(`ðŸ“¤ Still waiting... ${(i + 1) * 100}ms elapsed`);
                    // Check script status
                    if (ellipticScript) {
                        console.log(`ðŸ“¤ Script readyState: ${ellipticScript.readyState || 'not set'}`);
                    }
                }
            }

            // If still not loaded, throw error
            if (!loaded) {
                console.error('âŒ Elliptic library did not load after 15 seconds');
                console.error('ðŸ“¤ Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('elliptic')));
                throw new Error('Elliptic library failed to load. Please refresh the page. If the problem persists, check your internet connection.');
            }
        } else {
            console.log('âœ… Elliptic library already available');
        }

        console.log('ðŸ“¤ Final check: window.elliptic?', typeof window !== 'undefined' && !!window.elliptic);

        if (typeof window === 'undefined' || !window.elliptic) {
            console.error('âŒ CRITICAL: Elliptic library still not available!');
            throw new Error('Elliptic library is required for transaction signing but is not available. Please refresh the page.');
        }

        // CRITICAL: Try to get public key even if elliptic seems unavailable
        let keyPair = null;
        let publicKeyHex = null;

        console.log('ðŸ“¤ About to create keyPair...');
        try {
            // Use elliptic if available (matches blockchain format exactly)
            if (typeof window !== 'undefined' && window.elliptic) {
                console.log('ðŸ“¤ window.elliptic is available');
                console.log('ðŸ“¤ window.elliptic.ec exists?', !!window.elliptic.ec);
                const EC = window.elliptic.ec;
                console.log('ðŸ“¤ EC constructor:', typeof EC);
                const ec = new EC('secp256k1');
                console.log('ðŸ“¤ EC instance created');
                console.log('ðŸ“¤ About to create keyPair from private key...');
                const privateKeyHex = privateKey.replace(/^0x/, '');
                console.log('ðŸ“¤ Private key hex length:', privateKeyHex.length);
                keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
                console.log('âœ… keyPair created');

                // Get public key in uncompressed format (130 hex chars starting with 04)
                console.log('ðŸ“¤ Getting public key...');
                publicKeyHex = keyPair.getPublic(false, 'hex'); // false = uncompressed
                console.log('âœ… Public key obtained, length:', publicKeyHex.length);
                console.log('ðŸ“¤ Public key starts with 04?', publicKeyHex.startsWith('04'));

                // Validate it's the correct format
                if (publicKeyHex.length !== 130 || !publicKeyHex.startsWith('04')) {
                    console.warn('âš ï¸ Public key format issue, trying alternative...');
                    // If not correct, try alternative method
                    const publicKey = keyPair.getPublic('hex');
                    if (publicKey.length === 130 && publicKey.startsWith('04')) {
                        publicKeyHex = publicKey;
                    } else {
                        // Force uncompressed format
                        publicKeyHex = keyPair.getPublic(false, 'hex');
                    }
                }

                // Final validation
                if (publicKeyHex.length !== 130 || !publicKeyHex.startsWith('04')) {
                    console.error('âš ï¸ Public key format issue:', {
                        length: publicKeyHex.length,
                        startsWith04: publicKeyHex.startsWith('04'),
                        firstChars: publicKeyHex.substring(0, 10)
                    });
                    throw new Error('Invalid public key format');
                }
            } else {
                throw new Error('Elliptic library not available');
            }
        } catch (error) {
            console.error('âŒ Failed to initialize elliptic or get public key:', error);
            // Try one more time to load elliptic
            if (typeof window !== 'undefined' && !window.elliptic) {
                console.log('ðŸ”„ Retrying elliptic library load...');
                await this.loadEllipticLibrary();
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait for library to initialize

                if (typeof window !== 'undefined' && window.elliptic) {
                    try {
                        const EC = window.elliptic.ec;
                        const ec = new EC('secp256k1');
                        keyPair = ec.keyFromPrivate(privateKey.replace(/^0x/, ''), 'hex');
                        publicKeyHex = keyPair.getPublic(false, 'hex');

                        if (publicKeyHex.length !== 130 || !publicKeyHex.startsWith('04')) {
                            throw new Error('Invalid public key format after retry');
                        }
                    } catch (retryError) {
                        console.error('âŒ Retry also failed:', retryError);
                        throw new Error('Cannot sign transaction: Elliptic library unavailable and public key cannot be derived');
                    }
                } else {
                    throw new Error('Cannot sign transaction: Elliptic library unavailable and public key cannot be derived');
                }
            } else {
                throw new Error('Cannot sign transaction: ' + error.message);
            }
        }

        // Now sign the transaction
        try {
            // Create transaction data object (matches blockchain format)
            // CRITICAL: Property order MUST match server-side exactly!
            // Server uses: { from, to, amount, timestamp, data }
            const data = {
                from: transactionData.from,
                to: transactionData.to,
                amount: transactionData.amount,
                timestamp: transactionData.timestamp,
                data: transactionData.data || {}
            };

            // CRITICAL: Use deterministic JSON.stringify to ensure same hash as server
            // Sort keys to ensure consistent property order (matches server-side)
            // Server uses: JSON.stringify(transactionData, ['amount', 'data', 'from', 'timestamp', 'to'])
            // CRITICAL: Must stringify data object consistently too
            const sortedKeys = ['amount', 'data', 'from', 'timestamp', 'to']; // Explicit order

            // Ensure data object is also consistently stringified
            const normalizedData = {
                amount: data.amount,
                data: data.data || {},
                from: data.from,
                timestamp: data.timestamp,
                to: data.to
            };

            console.log('ðŸ“¤ About to stringify transaction data...');
            const dataString = JSON.stringify(normalizedData, sortedKeys);
            console.log('âœ… Transaction data stringified');
            console.log('ðŸ” Client: Transaction data string:', dataString);
            console.log('ðŸ” Client: Transaction data object:', normalizedData);

            console.log('ðŸ“¤ About to create hash...');
            const encoder = new TextEncoder();
            const dataBytes = encoder.encode(dataString);
            console.log('âœ… Data encoded to bytes');
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
            console.log('âœ… Hash buffer created');
            const msgHash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            console.log('âœ… Message hash created:', msgHash.substring(0, 20) + '...');

            // Sign with keyPair
            console.log('ðŸ“¤ About to sign with keyPair...');
            if (!keyPair) {
                console.error('âŒ KeyPair is null!');
                throw new Error('KeyPair not initialized');
            }
            console.log('âœ… KeyPair exists, signing...');
            const signature = keyPair.sign(msgHash);
            console.log('âœ… Signature created');

            // Return signature in blockchain format (object, not string)
            // CRITICAL: publicKey is ALWAYS included (never null)
            return {
                r: signature.r.toString('hex'),
                s: signature.s.toString('hex'),
                recoveryParam: signature.recoveryParam,
                publicKey: publicKeyHex // Uncompressed public key (130 hex chars starting with 04) - ALWAYS present
            };
        } catch (error) {
            console.error('âŒ Signing error:', error);
            throw new Error('Failed to sign transaction: ' + error.message);
        }
    }

    // Load elliptic library dynamically
    async loadEllipticLibrary() {
        console.log('ðŸ“¤ ========== loadEllipticLibrary() called ==========');

        return new Promise((resolve, reject) => {
            console.log('ðŸ“¤ Checking if elliptic already loaded...');
            if (typeof window !== 'undefined' && window.elliptic) {
                console.log('âœ… Elliptic library already loaded');
                resolve();
                return;
            }

            console.log('ðŸ“¤ Elliptic not loaded, checking for existing script tag...');
            // Check if script is already being loaded
            const existingScript = document.querySelector('script[src*="elliptic"]');
            if (existingScript) {
                console.log('ðŸ“¤ Found existing script tag');
                console.log('ðŸ“¤ Script src:', existingScript.src);
                console.log('ðŸ“¤ Script readyState:', existingScript.readyState);
                console.log('ðŸ“¤ Script onload exists?', !!existingScript.onload);
                console.log('ðŸ“¤ Script onerror exists?', !!existingScript.onerror);

                // Check if script already loaded but window.elliptic not set
                if (existingScript.readyState === 'complete' || existingScript.readyState === 'loaded') {
                    console.log('ðŸ“¤ Script tag shows as loaded, but window.elliptic not available');
                    console.log('ðŸ“¤ Checking window object for elliptic...');
                    console.log('ðŸ“¤ window keys containing "elliptic":', Object.keys(window).filter(k => k.toLowerCase().includes('elliptic')));

                    // Try waiting a bit more - sometimes library needs time to initialize
                    // Use setInterval instead of await in Promise constructor
                    let waitCount = 0;
                    const waitInterval = setInterval(() => {
                        waitCount++;
                        if (typeof window !== 'undefined' && window.elliptic) {
                            clearInterval(waitInterval);
                            console.log(`âœ… Elliptic library available after ${waitCount * 200}ms wait`);
                            resolve();
                            return;
                        }

                        if (waitCount >= 10) {
                            clearInterval(waitInterval);

                            // Script loaded but elliptic not available - check if it's a different global name
                            console.log('ðŸ“¤ Script loaded but window.elliptic not found');
                            console.log('ðŸ“¤ Checking for alternative global names...');
                            console.log('ðŸ“¤ window.ellipticjs?', typeof window !== 'undefined' && !!window.ellipticjs);
                            console.log('ðŸ“¤ window.Elliptic?', typeof window !== 'undefined' && !!window.Elliptic);

                            // Try to access via different methods
                            if (typeof window !== 'undefined') {
                                const possibleNames = ['elliptic', 'ellipticjs', 'Elliptic', 'EC'];
                                for (const name of possibleNames) {
                                    if (window[name]) {
                                        console.log(`âœ… Found elliptic at window.${name}, assigning to window.elliptic`);
                                        window.elliptic = window[name];
                                        resolve();
                                        return;
                                    }
                                }
                            }

                            // Script loaded but elliptic not available - remove and reload
                            console.log('ðŸ“¤ Removing failed script tag and trying new CDN...');
                            existingScript.remove();
                            // Continue to create new script below
                        }
                    }, 200);
                    return; // Exit early, will continue below if needed
                } else {
                    console.log('ðŸ“¤ Script tag not yet loaded, waiting...');
                    const checkInterval = setInterval(() => {
                        if (typeof window !== 'undefined' && window.elliptic) {
                            clearInterval(checkInterval);
                            console.log('âœ… Elliptic library loaded from existing script');
                            resolve();
                        }
                    }, 100);

                    // Timeout after 10 seconds
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        if (typeof window !== 'undefined' && window.elliptic) {
                            console.log('âœ… Elliptic library loaded (timeout check)');
                            resolve();
                        } else {
                            console.error('âŒ Existing script tag did not load elliptic in time');
                            console.error('âŒ Removing failed script and trying alternative...');
                            existingScript.remove();
                            // Continue to create new script below
                        }
                    }, 10000);

                    existingScript.onerror = () => {
                        clearInterval(checkInterval);
                        console.error('âŒ Existing script tag failed to load');
                        existingScript.remove();
                        // Continue to create new script below
                    };

                    // If script is still loading, wait for it
                    if (existingScript.readyState !== 'complete' && existingScript.readyState !== 'loaded') {
                        return; // Wait for timeout or onload
                    }
                }
            }

            console.log('ðŸ“¤ Creating new script tag...');
            // Try local file first, then CDNs as fallback
            const cdnUrls = [
                './elliptic.min.js',  // Local file (same domain, no CORS issues)
                'https://cdn.jsdelivr.net/npm/elliptic@6.5.4/dist/elliptic.min.js',
                'https://unpkg.com/elliptic@6.5.4/dist/elliptic.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/elliptic/6.5.4/elliptic.min.js'
            ];

            const tryLoadFromCDN = (index) => {
                if (index >= cdnUrls.length) {
                    reject(new Error('All CDN sources failed to load elliptic library'));
                    return;
                }

                console.log(`ðŸ“¤ Trying CDN ${index + 1}/${cdnUrls.length}: ${cdnUrls[index]}`);
                const script = document.createElement('script');
                script.src = cdnUrls[index];
                script.async = false;
                script.crossOrigin = 'anonymous';

                let resolved = false;
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        console.error(`âŒ CDN ${index + 1} timeout, trying next...`);
                        script.remove();
                        if (index + 1 < cdnUrls.length) {
                            tryLoadFromCDN(index + 1);
                        } else {
                            reject(new Error('All CDN sources timed out'));
                        }
                    }
                }, 10000); // 10 second timeout per CDN

                script.onload = () => {
                    if (resolved) return;
                    console.log(`ðŸ“¤ CDN ${index + 1} script onload fired, checking window.elliptic...`);
                    clearTimeout(timeout);
                    // Wait longer for library to initialize
                    setTimeout(() => {
                        if (typeof window !== 'undefined' && window.elliptic) {
                            console.log(`âœ… Elliptic library loaded successfully from CDN ${index + 1}`);
                            resolved = true;
                            resolve();
                        } else {
                            console.error(`âŒ CDN ${index + 1} script loaded but window.elliptic not available`);
                            script.remove();
                            if (index + 1 < cdnUrls.length) {
                                console.log(`ðŸ“¤ Trying next CDN...`);
                                tryLoadFromCDN(index + 1);
                            } else {
                                resolved = true;
                                reject(new Error('All CDNs loaded but window.elliptic not available'));
                            }
                        }
                    }, 1000); // Wait 1 second for library to initialize
                };

                script.onerror = () => {
                    if (resolved) return;
                    clearTimeout(timeout);
                    console.error(`âŒ CDN ${index + 1} failed, trying next...`);
                    script.remove();
                    if (index + 1 < cdnUrls.length) {
                        tryLoadFromCDN(index + 1);
                    } else {
                        resolved = true;
                        reject(new Error('All CDN sources failed to load'));
                    }
                };

                console.log(`ðŸ“¤ Appending script to document.head (CDN ${index + 1})...`);
                document.head.appendChild(script);
                console.log(`âœ… Script tag appended, waiting for load...`);
            };

            // Start loading from first CDN
            tryLoadFromCDN(0);
        });
    }

    // Helper: Convert hex string to ArrayBuffer
    hexToArrayBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    }

    async getTransactionHistory(address) {
        // Get blockchain info and filter transactions
        const blockchain = await this.getBlockchainInfo();
        const transactions = [];

        // Extract transactions from blocks
        if (blockchain.chain) {
            blockchain.chain.forEach(block => {
                if (block.transactions) {
                    block.transactions.forEach(tx => {
                        if (tx.from === address || tx.to === address) {
                            transactions.push({
                                ...tx,
                                blockIndex: block.index,
                                blockHash: block.hash,
                                timestamp: block.timestamp
                            });
                        }
                    });
                }
            });
        }

        return transactions.sort((a, b) => b.timestamp - a.timestamp);
    }

    // Blockchain Info
    async getBlockchainInfo() {
        return await this.request('/api/blockchain');
    }

    // Alias for getChain (used by mobile miner)
    async getChain() {
        return await this.getBlockchainInfo();
    }

    // Get pending transactions
    async getPendingTransactions() {
        try {
            return await this.request('/api/transactions/pending');
        } catch (error) {
            // If endpoint doesn't exist, try alternative endpoint or return empty array
            if (error.message.includes('404') || error.message.includes('not found') || error.message.includes('Endpoint not found')) {
                console.warn('âš ï¸ Pending transactions endpoint not available, trying alternative...');
                try {
                    // Try to get from blockchain info if it includes pending transactions
                    const blockchainInfo = await this.getBlockchainInfo();
                    if (blockchainInfo && blockchainInfo.pendingTransactions) {
                        return blockchainInfo.pendingTransactions;
                    }
                } catch (e) {
                    // Ignore
                }
                // Return empty array if no alternative available
                return [];
            }
            throw error;
        }
    }

    async getNetworkStatus() {
        return await this.request('/api/network/peers');
    }

    async getTokenomics() {
        return await this.request('/api/tokenomics');
    }

    // Mining
    async mineBlock(minerAddress, blockData = null) {
        try {
            if (!minerAddress) {
                throw new Error('Miner address is required');
            }

            // Validate address format
            const cleanAddress = minerAddress.replace(/^0x/, '');
            if (!/^[0-9a-fA-F]{40}$/.test(cleanAddress)) {
                throw new Error('Invalid miner address format');
            }

            if (blockData) {
                // Submit pre-mined block
                return await this.request('/api/mine', {
                    method: 'POST',
                    body: JSON.stringify({
                        minerAddress: minerAddress,
                        block: blockData
                    })
                });
            } else {
                // Server-side mining - ensure minerAddress is sent correctly
                const requestBody = { minerAddress: minerAddress };
                console.log('â›ï¸ Mining request to:', this.apiUrl + '/api/mine');
                console.log('â›ï¸ Mining request body:', requestBody);

                const result = await this.request('/api/mine', {
                    method: 'POST',
                    body: JSON.stringify(requestBody)
                });

                console.log('â›ï¸ Mining response:', result);

                // Handle different response formats
                if (result.block) {
                    return { success: true, block: result.block };
                } else if (result.success !== undefined) {
                    return result;
                } else {
                    // If response is a block directly
                    return { success: true, block: result };
                }
            }
        } catch (error) {
            console.error('âŒ Mine block error:', error);
            console.error('Error details:', {
                message: error.message,
                endpoint: this.apiUrl + '/api/mine',
                minerAddress: minerAddress
            });

            // Provide better error message
            if (error.message.includes('minerAddress') || error.message.includes('Miner address')) {
                throw new Error('Mining failed: Miner address is required');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Cannot connect to blockchain server. Please check your internet connection.');
            } else if (error.message.includes('503') || error.message.includes('initializing')) {
                throw new Error('Blockchain server is initializing. Please try again in a moment.');
            }
            throw error;
        }
    }

    async getMiningStatus() {
        return await this.request('/api/mining/status');
    }

    // Health Check
    async healthCheck() {
        return await this.request('/api/health');
    }

    // Bridge Operations
    async mintTokens(toAddress, amount, reason = 'bridge_in') {
        // Mint tokens for bridge-in operations
        return await this.request('/api/bridge/mint', {
            method: 'POST',
            body: JSON.stringify({
                to: toAddress,
                amount: amount,
                reason: reason
            })
        });
    }

    async verifyBridgeTransaction(fromChain, transactionHash, amount, recipient) {
        // Verify bridge transaction on backend
        return await this.request('/api/bridge/verify', {
            method: 'POST',
            body: JSON.stringify({
                fromChain: fromChain,
                transactionHash: transactionHash,
                amount: amount,
                recipient: recipient
            })
        });
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CheeseBlockchainAPI;
}

