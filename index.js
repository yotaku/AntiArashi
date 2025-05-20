const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');

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

client.login(process.env.BOT_TOKEN);