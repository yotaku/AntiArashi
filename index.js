const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});
server.listen(process.env.PORT || 3000);


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const messageContent = message.content.toLowerCase();
  const matchedInvite = config.bannedInvites.find(invite => messageContent.includes(invite.toLowerCase()));
  
  if (matchedInvite) {
    try {
      await message.delete();
      await message.guild.members.kick(message.author.id, `Posted banned invite: ${matchedInvite}`);
      console.log(`❌ Kicked ${message.author.tag} for banned invite`);
    } catch (error) {
      console.error(`⚠️ Failed to kick ${message.author.tag}:`, error);
    }
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  // メッセージの内容が変化していない、またはBotが編集した場合は無視
  if (!newMessage || !newMessage.content || newMessage.author?.bot) return;

  const messageContent = newMessage.content.toLowerCase();
  const matchedInvite = config.bannedInvites.find(invite => messageContent.includes(invite.toLowerCase()));
  
  if (matchedInvite) {
    try {
      await newMessage.delete();
      await newMessage.guild.members.kick(newMessage.author.id, `Edited message contained banned invite: ${matchedInvite}`);
      console.log(`❌ Kicked ${newMessage.author.tag} for banned invite (edited message)`);
    } catch (error) {
      console.error(`⚠️ Failed to kick ${newMessage.author.tag} (edited):`, error);
    }
  }
});

client.login(process.env.BOT_TOKEN);
