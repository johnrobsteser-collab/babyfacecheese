/**
 * Wallet System with Cryptographic Security
 * Uses Elliptic Curve Cryptography (ECDSA) for digital signatures
 */

const EC = require('elliptic').ec;
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const ethers = require('ethers');

class Wallet {
    constructor(privateKey = null) {
        this.ec = new EC('secp256k1'); // Same curve as Bitcoin

        if (privateKey) {
            this.keyPair = this.ec.keyFromPrivate(privateKey, 'hex');
        } else {
            this.keyPair = this.ec.genKeyPair();
        }

        this.publicKey = this.keyPair.getPublic('hex');
        this.address = this.generateAddress();
    }

    generateAddress() {
        // CRITICAL: Use Standard Ethers.js Address Derivation (Keccak-256)
        // This ensures compatibility with Client-Side wallets (Metamask-style)
        try {
            // Ensure 0x prefix
            const pubKey = this.publicKey.startsWith('0x') ? this.publicKey : '0x' + this.publicKey;
            return ethers.computeAddress(pubKey);
        } catch (error) {
            console.error('Address derivation error:', error);
            // Fallback (should not happen if keys are valid)
            const hash = crypto.createHash('sha256').update(this.publicKey).digest('hex');
            return '0x' + hash.substring(0, 40);
        }
    }

    sign(data) {
        // Use deterministic serialization matching Server Logic
        // Server uses sorted keys: ['amount', 'data', 'from', 'timestamp', 'to']
        const sortedKeys = ['amount', 'data', 'from', 'timestamp', 'to'];
        const dataString = JSON.stringify(data, sortedKeys);
        const msgHash = crypto.createHash('sha256').update(dataString).digest('hex');
        const signature = this.keyPair.sign(msgHash);
        return {
            r: signature.r.toString('hex'),
            s: signature.s.toString('hex'),
            recoveryParam: signature.recoveryParam
        };
    }

    static verifySignature(data, signature, publicKey) {
        try {
            const ec = new EC('secp256k1');
            // CRITICAL: Use SAME sorted keys as sign() method for consistent hashing
            const sortedKeys = ['amount', 'data', 'from', 'timestamp', 'to'];
            const dataString = JSON.stringify(data, sortedKeys);
            const msgHash = crypto.createHash('sha256').update(dataString).digest('hex');
            const keyPair = ec.keyFromPublic(publicKey, 'hex');
            return keyPair.verify(msgHash, signature);
        } catch (error) {
            return false;
        }
    }

    encryptPrivateKey(password) {
        const privateKeyHex = this.keyPair.getPrivate('hex');
        return CryptoJS.AES.encrypt(privateKeyHex, password).toString();
    }

    static decryptPrivateKey(encryptedKey, password) {
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedKey, password);
            return bytes.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            return null;
        }
    }

    getPrivateKey() {
        return this.keyPair.getPrivate('hex');
    }

    toJSON() {
        return {
            address: this.address,
            publicKey: this.publicKey,
            // Never expose private key in JSON
        };
    }
}

class WalletManager {
    constructor(database) {
        this.database = database;
        this.wallets = new Map();
    }

    async createWallet(password = null) {
        const wallet = new Wallet();

        if (password) {
            const encryptedKey = wallet.encryptPrivateKey(password);
            await this.database.saveWallet({
                address: wallet.address,
                publicKey: wallet.publicKey,
                encryptedPrivateKey: encryptedKey,
                balance: 0
            });
        } else {
            await this.database.saveWallet({
                address: wallet.address,
                publicKey: wallet.publicKey,
                balance: 0
            });
        }

        this.wallets.set(wallet.address, wallet);
        return wallet;
    }

    async loadWallet(address, password = null) {
        const walletData = await this.database.getWallet(address);
        if (!walletData) {
            return null;
        }

        let privateKey = null;
        if (walletData.encryptedPrivateKey && password) {
            privateKey = Wallet.decryptPrivateKey(walletData.encryptedPrivateKey, password);
            if (!privateKey) {
                throw new Error('Invalid password');
            }
        }

        const wallet = new Wallet(privateKey);
        this.wallets.set(wallet.address, wallet);
        return wallet;
    }

    getWallet(address) {
        return this.wallets.get(address);
    }

    signTransaction(wallet, transaction) {
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        const signature = wallet.sign({
            from: transaction.from,
            to: transaction.to,
            amount: transaction.amount,
            timestamp: transaction.timestamp,
            data: transaction.data
        });

        return {
            ...signature,
            publicKey: wallet.publicKey
        };
    }



    /**
     * Import wallet from mnemonic using Custom Double Hash logic
     * Matches the logic used by active community wallets (e.g. 0x5e0c...)
     */
    async importWalletFromMnemonic(mnemonic, index = 0) {
        try {
            // 1. Mnemonic to Seed (SHA256 of string)
            const normalizedMnemonic = mnemonic.trim().toLowerCase();
            const seedHash = crypto.createHash('sha256').update(normalizedMnemonic).digest();

            // 2. Derive Key Pair (SHA256 of Seed + Index)
            const combined = Buffer.alloc(seedHash.length + 4);
            seedHash.copy(combined);
            combined.writeUInt32BE(index, seedHash.length);

            const privateKeyBuffer = crypto.createHash('sha256').update(combined).digest();
            const privateKeyHex = privateKeyBuffer.toString('hex');

            // 3. Generate Address (Standard Derivation from Public Key)
            // Create wallet instance first to generate Public Key
            const wallet = new Wallet(privateKeyHex);

            // Use the standard generateAddress() method which uses SHA256(PublicKey)
            // This ensures the address matches the Public Key for verification
            // The previous "Double Hash of Private Key" logic was flawed as it decoupled Address from Public Key
            wallet.address = wallet.generateAddress();

            // Store in manager
            this.wallets.set(wallet.address, wallet);

            // Save to database
            await this.database.saveWallet({
                address: wallet.address,
                publicKey: wallet.publicKey,
                balance: 0,
                imported: true,
                derivation: 'standard-sha256'
            });

            console.log(`✅ Imported wallet: ${address}`);
            return wallet;

        } catch (error) {
            console.error('Import mnemonic error:', error);
            throw error;
        }
    }
}

module.exports = { Wallet, WalletManager };



