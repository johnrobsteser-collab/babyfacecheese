/**
 * Simple Express server for CHEESE Native Wallet
 * Serves static files for PWA deployment
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Health check endpoint (required for Cloud Run)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'cheese-native-wallet' });
});

// Serve index.html for root path explicitly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files with proper MIME types and index.html as default
app.use(express.static(__dirname, {
    index: 'index.html', // CRITICAL: Ensure index.html is served as default
    setHeaders: (res, filePath) => {
        // Set proper MIME types for all file types
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (filePath.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/jpeg');
        }
    }
}));

// Handle all other routes - serve index.html for SPA (but NOT for static files)
app.get('*', (req, res) => {
    const ext = path.extname(req.path);
    
    // If it's a static file request (has extension), check if exists
    if (ext && ext !== '.html' && ext !== '') {
        const filePath = path.join(__dirname, req.path);
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath); // Serve the actual file
        }
        // File doesn't exist - return 404 instead of index.html
        return res.status(404).send(`File not found: ${req.path}`);
    }
    
    // For HTML routes or paths without extensions, serve index.html
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server - listen on all interfaces (0.0.0.0) for Cloud Run
app.listen(PORT, '0.0.0.0', () => {
    console.log(`CHEESE Native Wallet server running on port ${PORT}`);
    console.log(`Listening on 0.0.0.0:${PORT}`);
    console.log(`Serving index.html from: ${__dirname}`);
});


