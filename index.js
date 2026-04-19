const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, PermissionFlagsBits, REST, Routes, 
    ChannelType 
} = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; 

// --- BASE DE DATOS LOCAL ---
const getDB = () => {
    if (!fs.existsSync('./security_db.json')) fs.writeFileSync('./security_db.json', JSON.stringify({}));
    return JSON.parse(fs.readFileSync('./security_db.json', 'utf8'));
};
const saveDB = (data) => fs.writeFileSync('./security_db.json', JSON.stringify(data, null, 2));

const userMessages = new Map(); // Anti-Spam

client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Sentinel v1.3 | Online & Secure`);
    
    const commands = [
        {
            name: 'security-config',
            description: 'Configure log channel',
            default_member_permissions: PermissionFlagsBits.Administrator.toString(),
            options: [{ name: 'log_channel', type: 7, description: 'Where to send alerts', required: true }]
        },
        {
            name: 'toggle-module',
            description: 'Enable/Disable security modules',
            default_member_permissions: PermissionFlagsBits.Administrator.toString(),
            options: [
                { name: 'module', type: 3, description: 'Module', required: true, choices: [{ name: 'Anti-Links', value: 'anti_link' }, { name: 'Anti-Spam', value: 'anti_spam' }] },
                { name: 'status', type: 5, description: 'True/False', required: true }
            ]
        },
        {
            name: 'blacklist-word',
            description: 'Manage server blacklisted words',
            default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            options: [
                { name: 'action', type: 3, description: 'Add or Remove', required: true, choices: [{name: 'add', value: 'add'}, {name: 'remove', value: 'remove'}] },
                { name: 'word', type: 3, description: 'Word to ban/unban', required: true }
            ]
        },
        {
            name: 'warn',
            description: 'Warn a user',
            default_member_permissions: PermissionFlagsBits.ManageMessages.toString(),
            options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }]
        },
        {
            name: 'infractions',
            description: 'Check user infraction history',
            options: [{ name: 'user', type: 6, description: 'Target', required: true }]
        },
        {
            name: 'timeout',
            description: 'Mute a user',
            default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
            options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Time', required: true }, { name: 'reason', type: 3, description: 'Reason' }]
        },
        {
            name: 'kick',
            description: 'Kick a user',
            default_member_permissions: PermissionFlagsBits.KickMembers.toString(),
            options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }]
        },
        {
            name: 'ban',
            description: 'Ban a user',
            default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
            options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }]
        },
        {
            name: 'echo',
            description: 'Repeat message',
            default_member_permissions: PermissionFlagsBits.ManageMessages.toString(),
            options: [{ name: 'text', type: 3, description: 'Message', required: true }]
        },
        {
            name: 'slowmode',
            description: 'Set channel slowmode',
            default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
            options: [{ name: 'seconds', type: 4, description: 'Seconds', required: true }]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- LÓGICA DE PROTECCIÓN (MENSAJES) ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    const db = getDB();
    const config = db[message.guildId];
    if (!config) return;

    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages);

    // 1. Filtro de Palabras
    const bannedWords = config.bannedWords || [];
    if (bannedWords.some(w => message.content.toLowerCase().includes(w.toLowerCase())) && !isStaff) {
        await message.delete().catch(() => {});
        return message.channel.send(`🚫 <@${message.author.id}>, that word is prohibited.`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // 2. Anti-Link
    if (config.modules?.anti_link && !isStaff) {
        if (/(discord\.gg\/|discord\.com\/invite\/)/gi.test(message.content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`🔗 <@${message.author.id}>, invites are not allowed.`).then(m => setTimeout(() => m.delete(), 3000));
        }
    }

    // 3. Anti-Spam
    if (config.modules?.anti_spam && !isStaff) {
        const now = Date.now();
        const userData = userMessages.get(message.author.id) || { count: 0, last: now };
        if (now - userData.last < 5000) userData.count++;
        else userData.count = 1;
        userData.last = now;
        userMessages.set(message.author.id, userData);

        if (userData.count > 5) {
            await message.member.timeout(60000, "Spam detected").catch(() => {});
            message.channel.send(`🔇 <@${message.author.id}> muted for 1m (Spam).`);
            userMessages.delete(message.author.id);
        }
    }
});

// --- LÓGICA DE INTERACCIONES (COMANDOS) ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const db = getDB();
    const config = db[interaction.guildId] || { warns: {}, bannedWords: [], modules: {} };
    const { commandName, options } = interaction;

    // COMANDOS DE CONFIGURACIÓN
    if (commandName === 'security-config') {
        config.logChannel = options.getChannel('log_channel').id;
        db[interaction.guildId] = config; saveDB(db);
        return interaction.reply({ content: '✅ Log channel updated.', ephemeral: true });
    }

    if (commandName === 'toggle-module') {
        const mod = options.getString('module');
        const stat = options.getBoolean('status');
        if (!config.modules) config.modules = {};
        config.modules[mod] = stat;
        db[interaction.guildId] = config; saveDB(db);
        return interaction.reply({ content: `✅ **${mod}** is now **${stat ? 'ON' : 'OFF'}**.`, ephemeral: true });
    }

    if (commandName === 'blacklist-word') {
        const action = options.getString('action');
        const word = options.getString('word').toLowerCase();
        if (!config.bannedWords) config.bannedWords = [];
        if (action === 'add') { if (!config.bannedWords.includes(word)) config.bannedWords.push(word); }
        else { config.bannedWords = config.bannedWords.filter(w => w !== word); }
        db[interaction.guildId] = config; saveDB(db);
        return interaction.reply({ content: `✅ Blacklist updated for: \`${word}\``, ephemeral: true });
    }

    // COMANDOS DE MODERACIÓN (USAN DEFER PARA EVITAR "APP DID NOT RESPOND")
    if (['kick', 'ban', 'timeout', 'slowmode'].includes(commandName)) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            if (commandName === 'kick' || commandName === 'ban') {
                const target = options.getMember('user');
                const reason = options.getString('reason') || 'No reason provided';
                if (!target || !target.manageable) return interaction.editReply("❌ I cannot moderate this user (Check role hierarchy).");
                
                if (commandName === 'ban') await target.ban({ reason });
                else await target.kick(reason);
                return interaction.editReply(`✅ **${target.user.tag}** has been ${commandName}ed.`);
            }

            if (commandName === 'timeout') {
                const target = options.getMember('user');
                const mins = options.getInteger('minutes');
                if (!target || !target.manageable) return interaction.editReply("❌ Cannot mute this user.");
                await target.timeout(mins * 60000, options.getString('reason') || 'No reason');
                return interaction.editReply(`✅ **${target.user.tag}** muted for ${mins} minutes.`);
            }

            if (commandName === 'slowmode') {
                const sec = options.getInteger('seconds');
                await interaction.channel.setRateLimitPerUser(sec);
                return interaction.editReply(`⏳ Slowmode set to **${sec}s**.`);
            }
        } catch (e) {
            return interaction.editReply("❌ Action failed. Check my permissions.");
        }
    }

    // HISTORIAL Y OTROS (RESPUESTA INMEDIATA)
    if (commandName === 'warn') {
        const target = options.getUser('user');
        const reason = options.getString('reason');
        if (!config.warns) config.warns = {};
        if (!config.warns[target.id]) config.warns[target.id] = [];
        config.warns[target.id].push({ reason, date: new Date().toLocaleString('es-CO') });
        db[interaction.guildId] = config; saveDB(db);
        return interaction.reply(`⚠️ **Warning added to ${target.tag}**. Total: ${config.warns[target.id].length}`);
    }

    if (commandName === 'infractions') {
        const target = options.getUser('user');
        const list = config.warns?.[target.id] || [];
        const embed = new EmbedBuilder().setTitle(`History: ${target.tag}`).setColor('#00ffff')
            .setDescription(list.length ? list.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') : '✅ Clean record.');
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'echo') {
        await interaction.channel.send(options.getString('text'));
        return interaction.reply({ content: 'Sent!', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
