require('dotenv').config();
const { Vonage } = require('@vonage/server-sdk');
const { Channels } = require('@vonage/messages');

const vonage = new Vonage({
  apiKey: process.env.VONAGE_KEY,
  apiSecret: process.env.VONAGE_SECRET,
});

vonage.messages.send({
  messageType: 'text',
  channel: Channels.SMS,
  text: 'PartPulse test alert!',
  to: '359876736858',
  from: process.env.VONAGE_FROM,
})
.then(({ messageUUID }) => console.log('SMS sent! UUID:', messageUUID))
.catch(err => console.error('Error:', err.message));
