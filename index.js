const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const LOG_CH = '1373520267023876096';
const SETTINGS_FILE = './settings.json';

// 設定読み込み
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    console.warn('⚠️ 設定ファイルの読み込みに失敗しました');
  }
}

// 設定保存
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Discordログ送信
function logToDiscord(msg) {
  const ch = client.channels.cache.get(LOG_CH);
  if (ch?.isTextBased()) ch.send('```fix\n' + msg.slice(0, 1900) + '\n```');
}

// エラーハンドリング
process.on('unhandledRejection', err => {
  console.error(err);
  logToDiscord('UnhandledRejection:\n' + (err.stack || err));
});
process.on('uncaughtException', err => {
  console.error(err);
  logToDiscord('UncaughtException:\n' + (err.stack || err));
});

// 定期再起動（Renderなどの健康チェック対応）
setInterval(() => {
  logToDiscord('💤 Daily restart for health check');
  process.exit(0);
}, 24 * 60 * 60 * 1000);

require('dotenv').config();

let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1367044432800518185';

// コマンド定義
const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('ログチャンネルと許可する招待リンクを設定します')
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('ログを送るチャンネル')
      .setRequired(true))
  .addStringOption(opt =>
    opt.setName('invite1')
      .setDescription('許可する招待リンク1 (オプション)')
      .setRequired(false))
  .addStringOption(opt =>
    opt.setName('invite2')
      .setDescription('許可する招待リンク2')
      .setRequired(false))
  .addStringOption(opt =>
    opt.setName('invite3')
      .setDescription('許可する招待リンク3')
      .setRequired(false))
  .addStringOption(opt =>
    opt.setName('invite4')
      .setDescription('許可する招待リンク4')
      .setRequired(false))
  .addStringOption(opt =>
    opt.setName('invite5')
      .setDescription('許可する招待リンク5')
      .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: [setupCommand.toJSON()]
    });
    console.log('✅ スラッシュコマンド登録完了');
  } catch (err) {
    console.error('❌ コマンド登録エラー:', err);
  }
})();

// メッセージ監視
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9\-]+)/i;
  const match = message.content.match(inviteRegex);
  if (match) {
    const invite = match[0];
    const isAllowed = config.allowedInvites.some(allowed => invite.includes(allowed));
    if (!isAllowed) {
      try {
        await message.delete();
        await message.member.timeout(10_000, '許可されていない招待リンク');

        if (config.logChannelId) {
          const logChannel = await client.channels.fetch(config.logChannelId);
          if (logChannel && logChannel.isTextBased()) {
            logChannel.send(`🚫 ${message.author.tag} が許可されていない招待リンクを送信し、10秒間タイムアウトされました。\n送信内容: ${invite}`);
          }
        }
      } catch (err) {
        console.error('❌ メッセージ削除/タイムアウト失敗:', err);
      }
    }
  }
});

// /setup コマンド処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({ content: '❌ あなたにはこのコマンドを実行する権限がありません。', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const invites = [];

    for (let i = 1; i <= 5; i++) {
      const value = interaction.options.getString(`invite${i}`);
      if (value) invites.push(value);
    }

    config.logChannelId = channel.id;
    config.allowedInvites = invites;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

    await interaction.reply({
      content: `✅ ログチャンネルを ${channel} に設定し、${invites.length} 件の許可リンクを登録しました。`,
      ephemeral: true
    });
  }
});

client.once('ready', () => {
  console.log(`🤖 Botが起動しました: ${client.user.tag}`);
});

client.login(TOKEN);
