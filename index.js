require('dotenv').config();

const app = require('express')();
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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

console.log(`Listening to events on ${address} \n`);

async function createDLC(feedAddress, closingTime, emergencyRefundTime, caller) {
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

provider.on("block", (blockNumber) => {
  io.emit('eth event', `New block: ${blockNumber}`);
  console.log(`New block: ${blockNumber}`);
})

contract.on("RequestCreateDLC", (feedAddress, closingTime, emergencyRefundTime, caller) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC request @ ${currentTime} \n\t feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} | caller: ${caller} \n`);
  console.log(`New DLC request @ ${currentTime} \n\t feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} | caller: ${caller} \n`);
  const response = createDLC(feedAddress, closingTime, emergencyRefundTime, caller);
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
  const response = await createDLC("0x6135b13325bfC4B00278B4abC5e20bbce2D6580e", "2022-05-26", "2022-05-26", "0xasdfa");
  console.log(response);
})();
