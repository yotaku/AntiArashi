const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});
const TOKEN = process.env.TOKEN;
let db = JSON.parse(fs.readFileSync('./database.json', 'utf-8'));
const messageHistory = new Map();
let saveTimeout;

function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
    }, 2000);
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const now = Date.now();
    const timestamps = messageHistory.get(message.author.id) || [];
    timestamps.push(now);
    messageHistory.set(message.author.id, timestamps.filter(ts => now - ts < 10000));

    if (timestamps.length >= 5) {
        try {
            await message.delete();
            await message.member.timeout(30 * 1000, 'Spam detected');
            await message.author.send('あなたが送信したメッセージは荒らし対策により削除されました。');
            const logChannelId = db[message.guild.id];
            if (logChannelId) {
                const logChannel = await client.channels.fetch(logChannelId);
                if (logChannel) {
                    logChannel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔧 スパム検知')
                            .setDescription(`@${message.author.globalName} がスパム行為を行ったためメッセージを削除・タイムアウトしました。`)
                            .setFooter({ text: "Bot" })
                        ]
                    });
                }
            }
        } catch (err) {
            console.error("スパム処理エラー:", err);
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'setup') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
        }
        db[interaction.guild.id] = interaction.channel.id;
        scheduleSave();
        interaction.reply('このチャンネルをログ用に設定しました。');
    }
});

client.once('ready', () => {
    console.log(`${client.user.tag} でログインしました`);
});

// ---- 以下を追記 ----
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('AntiArashi bot is running!');
});

app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});

client.login(TOKEN);
