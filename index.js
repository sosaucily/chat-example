require('dotenv').config();

const express = require('express')
const app = express();
app.use(express.json());
const fetch = require('node-fetch');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { ethers } = require("ethers");

const port = process.env.PORT || 8000;


const abi = require('./ABIs/DiscreetLog.json');

const INFURA_ID = process.env.INFURA_PROJ_ID;

// TODO: provider network & contract address should be settable as cmdline arg / in config file
const NETWORK = 'kovan'
const ADDRESS = '0x365441EC0974F6AC9871c704128e9da2BEdE10CE';

const provider = new ethers.providers.JsonRpcProvider(`https://${NETWORK}.infura.io/v3/${INFURA_ID}`);
const address = ADDRESS;

const contract = new ethers.Contract(address, abi, provider);

console.log(`Listening to events on ${address} \n`);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

//This accepts calls from the rails server to add the DLC with UUID into the smart contract
app.post('/addNewDLC', (req, res) => {
  console.log('pushing back to chain', req.body);
  res.send(req.body);
  addNewDLC(req.body.uuid, req.body.feedAddress, req.body.closingTime, req.body.emergencyRefundTime); //write into the contract.
});

async function addNewDLC(uuid, feedAddress, closingTime, emergencyRefundTime); //write into the blockchain contract.

async function requestCreateDLC(feedAddress, closingTime, emergencyRefundTime, caller) {
  currencySymbol = await getCurrencyNameFromCLContractAddress(feedAddress)
  const body = {
    clFeedUrl: feedAddress,
    currencySymbol: currencySymbol,
    currencyName: currencySymbol,
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

async function closeDLC(uuid, price) {
  const body = {
    price: price,
    uuid: uuid,
  }
  try {
    const response = await fetch(process.env.ORACLE_INTERFACE_DOMAIN + '/contracts/close', {
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

async function getCurrencyNameFromCLContractAddress(address) {
  try {
    const response = await fetch(process.env.CL_DATA_FEEDS_URL)
    if (!response.ok) {
      // NOT res.status >= 200 && res.status < 300
      return { statusCode: response.status, body: response.statusText }
    }
    const data = await response.json()
    const networks = data['ethereum-addresses']['networks']
    const mainNetIndex = networks.findIndex(network => network['name'] == 'Kovan Testnet');
    const entryIndex = networks[mainNetIndex]['proxies'].findIndex(entry => entry['proxy'] == address);
    entry = networks[mainNetIndex]['proxies'][entryIndex];
    pairName = entry['pair'].split(" /")[0];
    console.log(pairName);
    return pairName;
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

// provider.on("block", (blockNumber) => {
//   io.emit('eth event', `New block: ${blockNumber}`);
//   console.log(`New block: ${blockNumber}`);
// })

contract.on("RequestCreateDLC", (feedAddress, closingTime, emergencyRefundTime, caller) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC request @ ${currentTime} \n\t feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} | caller: ${caller} \n`);
  console.log(`New DLC request @ ${currentTime} \n\t feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} | caller: ${caller} \n`);
  const response = requestCreateDLC(feedAddress, closingTime, emergencyRefundTime, caller);
  console.log(response);
});

contract.on("NewDLC", (uuid, feedAddress, closingTime, emergencyRefundTime) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC created @ ${currentTime} \n\t uuid: ${uuid} | feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} \n`);
  console.log(`New DLC created @ ${currentTime} \n\t uuid: ${uuid} | feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} \n`);
});

contract.on("CloseDLC", (uuid, price, actualClosingTime) => {
  const currentTime = new Date();
  io.emit('eth event', `Closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
  console.log(`Closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
  const response = closeDLC(uuid, price);
  console.log(response);
});

contract.on("EarlyCloseDLC", (uuid, price, actualClosingTime) => {
  const currentTime = new Date();
  io.emit('eth event', `Early closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
  console.log(`Early closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
});

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});

(async function main() {
  // const response = await requestCreateDLC("0x6135b13325bfC4B00278B4abC5e20bbce2D6580e", "2022-05-26", "2022-05-26", "0xasdfab");
  // const response = await closeDLC("12345", "60");
  console.log(response);
})();
