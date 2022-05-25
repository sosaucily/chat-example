require('dotenv').config();

const app = require('express')();
const fetch = require('node-fetch');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { ethers } = require("ethers");

const port = process.env.PORT || 3000;

const abi = require('./ABIs/DiscreetLog.json');

const INFURA_ID = process.env.INFURA_PROJ_ID;

// TODO: provider network & contract address should be settable as cmdline arg / in config file
const NETWORK = 'kovan'
const ADDRESS = '0x365441EC0974F6AC9871c704128e9da2BEdE10CE';

const provider = new ethers.providers.JsonRpcProvider(`https://${NETWORK}.infura.io/v3/${INFURA_ID}`);
const address = ADDRESS;

const contract = new ethers.Contract(address, abi, provider);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

console.log(`Listening to events on ${address} \n`);

provider.on("block", (blockNumber) => {
  io.emit('eth event', `New block: ${blockNumber}`);
})

const createDLC = (feedAddress, closingTime, emergencyRefundTime, caller) => {
  const body = {
    clFeedUrl: feedAddress,
    currencySymbol: getCurrencyNameFromCLContractAddress(feedAddress),
    currencyName: getCurrencyNameFromCLContractAddress(feedAddress),
    maturationTime: `${closingTime}T23:59:00.000Z`,
    strikePrice: 50,
  }
  try {
    const response = await fetch(process.env.ORACLE_INTERFACE_DOMAIN + '/contracts', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      // NOT res.status >= 200 && res.status < 300
      return { statusCode: response.status, body: response.statusText }
    }
    const data = await response.json()

    return {
      statusCode: 200,
      body: JSON.stringify({ data }),
    }
  } catch (error) {
    // output to netlify function log
    console.log(error)
    return {
      statusCode: 500,
      // Could be a custom message or object i.e. JSON.stringify(err)
      body: JSON.stringify({ msg: error.message }),
    }
  }
}

const getCurrencyNameFromCLContractAddress = (address) => {
  try {
    const response = await fetch(process.env.CL_DATA_FEEDS_URL, {
      // headers: {
      //   "X-CMC_PRO_API_KEY": process.env.VUE_APP_CMC_PRO_API_KEY
      // }
    })
    if (!response.ok) {
      // NOT res.status >= 200 && res.status < 300
      return { statusCode: response.status, body: response.statusText }
    }
    const data = await response.json()
    const networks = data['ethereum-addresses']['networks']
    const mainNetIndex = networks.findIndex(network => network['name'] == 'Kovan Testnet');
    const entry = networks[mainNetIndex].findIndex(entry => entry['proxy'] == address);
    return entry['pair'].split(" /")[0];
  } catch (error) {
    // output to netlify function log
    console.log(error)
    return {
      statusCode: 500,
      // Could be a custom message or object i.e. JSON.stringify(err)
      body: JSON.stringify({ msg: error.message }),
    }
  }
}

contract.on("RequestCreateDLC", (feedAddress, closingTime, emergencyRefundTime, caller) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC request @ ${currentTime} \n\t feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} | caller: ${caller} \n`);
  const response = createDLC(feedAddress, closingTime, emergencyRefundTime, caller);
  console.log(response);
});

contract.on("NewDLC", (uuid, feedAddress, closingTime, emergencyRefundTime) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC created @ ${currentTime} \n\t uuid: ${uuid} | feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} \n`);
});
contract.on("CloseDLC", (uuid, price, actualClosingTime) => {
  const currentTime = new Date();
  io.emit('eth event', `Closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
});
contract.on("EarlyCloseDLC", (uuid, price, actualClosingTime) => {
  const currentTime = new Date();
  io.emit('eth event', `Early closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
});

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});

