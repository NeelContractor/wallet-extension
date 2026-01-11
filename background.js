
console.log('Solana Wallet Extension - Background Service Worker Started');

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Set default values
  chrome.storage.local.set({
    network: 'mainnet-beta',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com'
  });
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);

  switch (request.type) {
    case 'GET_WALLET_ADDRESS':
      handleGetWalletAddress(sendResponse);
      return true;

    case 'GET_BALANCE':
      handleGetBalance(request.address, sendResponse);
      return true;

    case 'SIGN_TRANSACTION':
      handleSignTransaction(request.transaction, sendResponse);
      return true;

    case 'SEND_TRANSACTION':
      handleSendTransaction(request.transaction, sendResponse);
      return true;

    case 'CONNECT_WALLET':
      handleConnectWallet(sender, sendResponse);
      return true;

    case 'DISCONNECT_WALLET':
      handleDisconnectWallet(sender, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// Get wallet address from storage
async function handleGetWalletAddress(sendResponse) {
  try {
    chrome.storage.local.get(['walletAddress', 'publicKey'], (result) => {
      if (result.walletAddress) {
        sendResponse({ 
          success: true, 
          address: result.walletAddress,
          publicKey: result.publicKey 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: 'No wallet found' 
        });
      }
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Get balance from Solana blockchain
async function handleGetBalance(address, sendResponse) {
  try {
    chrome.storage.local.get(['rpcEndpoint'], async (result) => {
      const rpcEndpoint = result.rpcEndpoint || 'https://api.mainnet-beta.solana.com';
      
      // Call Solana RPC
      const response = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address]
        })
      });

      const data = await response.json();
      
      if (data.result) {
        // Convert lamports to SOL (1 SOL = 1e9 lamports)
        const balanceSOL = data.result.value / 1e9;
        
        // Update storage
        chrome.storage.local.set({ balance: balanceSOL });
        
        sendResponse({ 
          success: true, 
          balance: balanceSOL,
          lamports: data.result.value 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: 'Failed to fetch balance' 
        });
      }
    });
  } catch (error) {
    console.error('Balance fetch error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Sign transaction (requires user approval)
async function handleSignTransaction(transaction, sendResponse) {
  try {
    // In production: 
    // 1. Show approval popup to user
    // 2. Decrypt private key with password
    // 3. Sign the transaction
    // 4. Return signature
    
    // For now, mock response
    console.log('Transaction to sign:', transaction);
    
    // Simulate signing delay
    setTimeout(() => {
      sendResponse({ 
        success: true, 
        signature: 'mock_signature_' + Date.now(),
        signedTransaction: transaction 
      });
    }, 500);
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Send transaction to blockchain
async function handleSendTransaction(transaction, sendResponse) {
  try {
    chrome.storage.local.get(['rpcEndpoint'], async (result) => {
      const rpcEndpoint = result.rpcEndpoint || 'https://api.mainnet-beta.solana.com';
      
      const response = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: [transaction, { encoding: 'base64' }]
        })
      });

      const data = await response.json();
      
      if (data.result) {
        sendResponse({ 
          success: true, 
          signature: data.result 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: data.error?.message || 'Transaction failed' 
        });
      }
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Handle dApp connection request
async function handleConnectWallet(sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    const origin = sender.origin || sender.url;
    
    console.log('Connection request from:', origin);
    
    // Get wallet info
    chrome.storage.local.get(['walletAddress', 'publicKey', 'connectedSites'], (result) => {
      if (!result.walletAddress) {
        sendResponse({ 
          success: false, 
          error: 'No wallet found' 
        });
        return;
      }

      // Check if already connected
      const connectedSites = result.connectedSites || [];
      const alreadyConnected = connectedSites.some(site => site.origin === origin);

      if (alreadyConnected) {
        sendResponse({ 
          success: true, 
          publicKey: result.publicKey,
          message: 'Already connected' 
        });
        return;
      }

      // In production: Show approval popup
      // For now, auto-approve
      const newConnection = {
        origin: origin,
        connectedAt: Date.now(),
        tabId: tabId
      };

      connectedSites.push(newConnection);
      
      chrome.storage.local.set({ connectedSites }, () => {
        sendResponse({ 
          success: true, 
          publicKey: result.publicKey,
          message: 'Connected successfully' 
        });
      });
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Handle disconnect
async function handleDisconnectWallet(sender, sendResponse) {
  try {
    const origin = sender.origin || sender.url;
    
    chrome.storage.local.get(['connectedSites'], (result) => {
      const connectedSites = result.connectedSites || [];
      const filtered = connectedSites.filter(site => site.origin !== origin);
      
      chrome.storage.local.set({ connectedSites: filtered }, () => {
        sendResponse({ success: true });
      });
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Periodic balance refresh
setInterval(() => {
  chrome.storage.local.get(['walletAddress'], (result) => {
    if (result.walletAddress) {
      handleGetBalance(result.walletAddress, (response) => {
        if (response.success) {
          console.log('Balance updated:', response.balance);
        }
      });
    }
  });
}, 30000); // Every 30 seconds