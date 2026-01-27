import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

console.log('🚀 Background service worker started');

const NETWORKS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'devnet': 'https://api.devnet.solana.com',
  'testnet': 'https://api.testnet.solana.com'
};

let connections = {};

function getConnection(network = 'devnet') {
  if (!connections[network]) {
    connections[network] = new Connection(NETWORKS[network], 'confirmed');
    console.log('✅ Connected to', network);
  }
  return connections[network];
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  chrome.storage.local.set({
    network: 'devnet'
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.type);

  switch (request.type) {
    case 'GET_BALANCE':
      handleGetBalance(request.address, request.network, sendResponse);
      return true;

    case 'GET_TRANSACTIONS':
      handleGetTransactions(request.address, request.network, sendResponse);
      return true;

    case 'CONNECT_WALLET':
      handleConnectWallet(sender, sendResponse);
      return true;

    case 'DISCONNECT_WALLET':
      handleDisconnectWallet(sender, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown type' });
  }
});

async function handleGetBalance(address, network, sendResponse) {
  try {
    const connection = getConnection(network);
    const publicKey = new PublicKey(address);
    
    const balance = await connection.getBalance(publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    
    console.log('✅ Balance:', balanceSOL, 'SOL');
    
    sendResponse({ 
      success: true, 
      balance: balanceSOL
    });
  } catch (error) {
    console.error('❌ Balance error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetTransactions(address, network, sendResponse) {
  try {
    const connection = getConnection(network);
    const publicKey = new PublicKey(address);
    
    const signatures = await connection.getSignaturesForAddress(
      publicKey,
      { limit: 10 }
    );
    
    const transactions = [];
    
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(
          sig.signature,
          { maxSupportedTransactionVersion: 0 }
        );
        
        if (tx && tx.meta) {
          const preBalance = tx.meta.preBalances[0] / LAMPORTS_PER_SOL;
          const postBalance = tx.meta.postBalances[0] / LAMPORTS_PER_SOL;
          const amount = Math.abs(postBalance - preBalance);
          
          transactions.push({
            signature: sig.signature,
            timestamp: sig.blockTime,
            type: postBalance > preBalance ? 'received' : 'sent',
            amount: amount,
            status: sig.confirmationStatus
          });
        }
      } catch (error) {
        console.error('Error parsing tx:', error);
      }
    }
    
    console.log('✅ Transactions:', transactions.length);
    
    sendResponse({ 
      success: true, 
      transactions: transactions
    });
  } catch (error) {
    console.error('❌ Transactions error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleConnectWallet(sender, sendResponse) {
  try {
    const result = await chrome.storage.local.get(['encryptedWallet']);
    
    if (result.encryptedWallet) {
      sendResponse({
        success: true,
        publicKey: result.encryptedWallet.publicKey
      });
    } else {
      sendResponse({
        success: false,
        error: 'No wallet found'
      });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleDisconnectWallet(sender, sendResponse) {
  sendResponse({ success: true });
}

console.log('✅ Background ready');