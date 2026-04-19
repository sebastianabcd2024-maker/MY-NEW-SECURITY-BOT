const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, REST, Routes } = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; // RECUERDA CAMBIAR ESTO

const getDB = () => {
    if (!fs.existsSync('./security_db.json')) fs.writeFileSync('./security_db.json', JSON.stringify({}));
    return JSON.parse(fs.readFileSync('./security_db.json', 'utf8'));
};
const saveDB = (data) => fs.writeFileSync('./security_db.json', JSON.stringify(data, null, 2));

client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Sentinel Active | Monitoring Global Servers`);
    const commands = [
        {
            name: 'security-config',
            description: 'Configure the Sentinel security settings',
            default_member_permissions: PermissionFlagsBits.Administrator.toString(),
            options: [
                { name: 'log_channel', type: 7, description: 'Channel for security alerts', required: true }
            ]
        },
        {
            name: 'toggle-module',
            description: 'Enable or disable security modules',
            default_member_permissions: PermissionFlagsBits.Administrator.toString(),
            options: [
                { 
                    name: 'module', 
                    type: 3, 
                    description: 'Select module', 
                    required: true, 
                    choices: [{ name: 'Anti-Links', value: 'anti_link' }, { name: 'Anti-Spam', value: 'anti_spam' }] 
                },
                { name: 'status', type: 5, description: 'True to Enable / False to Disable', required: true }
            ]
        }
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// LOGICA ANTI-LINKS
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    const db = getDB();
    const config = db[message.guildId];
    if (!config || !config.modules?.anti_link) return;

    // Detectar invitaciones de Discord
    const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/gi;
    if (inviteRegex.test(message.content)) {
        if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return; // Ignorar staff

        await message.delete().catch(() => {});
        
        const warning = await message.channel.send(`⚠️ <@${message.author.id}>, external invites are not allowed!`);
        setTimeout(() => warning.delete().catch(() => {}), 5000);

        // Enviar a Logs
        const logChan = client.channels.cache.get(config.logChannel);
        if (logChan) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🛡️ Sentinel Alert | Anti-Link')
                .setColor('#ff4b2b')
                .addFields(
                    { name: 'User', value: `${message.author.tag} (${message.author.id})` },
                    { name: 'Action', value: 'Message Deleted' },
                    { name: 'Content', value: message.content }
                )
                .setTimestamp();
            logChan.send({ embeds: [logEmbed] });
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    const db = getDB();
    const config = db[interaction.guildId] || { modules: { anti_link: false, anti_spam: false } };

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'security-config') {
            db[interaction.guildId] = { ...config, logChannel: interaction.options.getChannel('log_channel').id };
            saveDB(db);
            return interaction.reply({ content: '✅ Security logs channel updated.', ephemeral: true });
        }

        if (interaction.commandName === 'toggle-module') {
            const module = interaction.options.getString('module');
            const status = interaction.options.getBoolean('status');
            
            if (!config.modules) config.modules = {};
            config.modules[module] = status;
            
            db[interaction.guildId] = config;
            saveDB(db);
            return interaction.reply({ content: `✅ Module **${module}** is now **${status ? 'ENABLED' : 'DISABLED'}**.`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
