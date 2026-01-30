# Solana Wallet Extension

Trying to build a simple solana wallet extension 

## Demo Video

[![Watch the video](https://img.youtube.com/vi/SskCbwJXDrI/0.jpg)](https://youtu.be/watch?v=SskCbwJXDrI)

## Caution
- executeSwap failing // NO idea if it works or not i dont have real sol to test

## Step to Start
1. clone repo locally
```sh
git clone <repo_url>
```

2. install dependencies
```sh
npm install
```

3. navigate to manifest.json, add Jup Api Key (For Swap)

```code
"env": {
    "JUP_API_KEY": "your-jup-api-key-here"
}
```

4. build code
```sh
npm run build
```

5. load to chrome extension 
in browser go to chrome://extensions
click on 'Load Unpack' on top right.

6. open dist folder or wherever manifest.json file exists