const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType 
} = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; 
const OWNER_ID = "1238184110975877130"; 
const TOKEN = process.env.DISCORD_TOKEN; 

// --- STORAGE LOCAL ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 
const blacklistedUsers = new Set(); 
const forbiddenWords = new Map(); // [guildId]: Set of words

// --- REGISTRO DE COMANDOS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v5.0 [ULTIMATE-SECURITY] | Online`);

    const commands = [
        {
            name: 'eval',
            description: '[OWNER ONLY] Execute JavaScript code',
            options: [{ name: 'code', type: 3, description: 'Code to run', required: true }]
        },
        { 
            name: 'blacklist', 
            description: '[OWNER ONLY] Manage global blacklist', 
            options: [
                { name: 'action', type: 3, description: 'Add or Remove', required: true, choices: [{name: 'Add', value: 'add'}, {name: 'Remove', value: 'remove'}] },
                { name: 'user', type: 6, description: 'Target user', required: true },
                { name: 'reason', type: 3, description: 'Reason for blacklist', required: false }
            ] 
        },
        {
            name: 'badwords-add',
            description: 'Add a forbidden word to the filter',
            options: [{ name: 'word', type: 3, description: 'The word to block', required: true }]
        },
        {
            name: 'badwords-remove',
            description: 'Remove a forbidden word',
            options: [{ name: 'word', type: 3, description: 'The word to unblock', required: true }]
        },
        { name: 'badwords-list', description: 'List all forbidden words' },
        { 
            name: 'broadcast', 
            description: '[OWNER ONLY] Global Announcement', 
            options: [
                { name: 'message', type: 3, description: 'Announcement text', required: true },
                { name: 'title', type: 3, description: 'Embed title', required: false }
            ] 
        },
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'set-logs', description: 'Setup logs channel', options: [{ name: 'channel', type: 7, description: 'Channel', required: true }] },
        { 
            name: 'setup-antispam', 
            description: 'Configure Anti-Spam settings', 
            options: [
                { name: 'limit', type: 4, description: 'Message limit', required: true },
                { name: 'seconds', type: 4, description: 'Time window', required: true },
                { name: 'immune_role', type: 8, description: 'Role that bypasses anti-spam', required: false }
            ] 
        },
        { 
            name: 'slowmode', 
            description: 'Set channel slowmode', 
            options: [
                { name: 'seconds', type: 4, description: 'Seconds (0 to disable)', required: true },
                { name: 'reason', type: 3, description: 'Reason for slowmode', required: false }
            ] 
        },
        { name: 'audit', description: 'User security analysis', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'ban', description: 'Ban user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban ID', options: [{ name: 'user_id', type: 3, description: 'ID', required: true }] },
        { name: 'kick', description: 'Kick user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove timeout', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'role-give', description: 'Add role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { 
            name: 'create-role', 
            description: 'Role creator', 
            options: [
                { name: 'name', type: 3, description: 'Role name', required: true },
                { name: 'color', type: 3, description: 'Hex color', required: false },
                { name: 'level', type: 3, description: 'Tier', choices: [
                    { name: 'Decoration', value: 'decoration' }, { name: 'Member', value: 'member' },
                    { name: 'Moderator', value: 'moderator' }, { name: 'Senior Moderator', value: 'senior_mod' },
                    { name: 'Administrator', value: 'administrator' }, { name: 'Developer', value: 'developer' }
                ]}
            ] 
        },
        { name: 'create-channel', description: 'Create a channel', options: [
            { name: 'name', type: 3, description: 'Channel name', required: true },
            { name: 'type', type: 3, description: 'Text or Voice', required: true, choices: [{ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }] }
        ]},
        { 
            name: 'purge', 
            description: 'Delete messages with optional user filter', 
            options: [
                { name: 'amount', type: 4, description: 'Messages to scan (max 100)', required: true },
                { name: 'user', type: 6, description: 'Specific user to clean', required: false }
            ] 
        },
        {
            name: 'purge-after',
            description: 'Delete all messages sent after a specific Message ID',
            options: [{ name: 'message_id', type: 3, description: 'The ID of the message to start cleaning from', required: true }]
        },
        { name: 'lock', description: 'Full channel lockdown' },
        { name: 'unlock', description: 'Unlock channel interactions' },
        { name: 'color', description: 'Color info', options: [{ name: 'input', type: 3, description: 'Hex or Name', required: true }] },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Text', required: true }] },
        { name: 'flip', description: 'Coin flip' },
        { 
            name: 'embed', 
            description: 'Generate a custom embed', 
            options: [
                { name: 'description', type: 3, description: 'Main content', required: true },
                { name: 'title', type: 3, description: 'Embed title' },
                { name: 'color', type: 3, description: 'Hex color' },
                { name: 'thumbnail', type: 3, description: 'Thumbnail URL' },
                { name: 'image', type: 3, description: 'Large image URL' }
            ] 
        }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- HELPER: NORMALIZACIÓN DE TEXTO ---
const normalize = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

// --- SISTEMA DE PROTECCIÓN AUTO-KICK ---
client.on(Events.GuildMemberAdd, async (member) => {
    if (blacklistedUsers.has(member.id)) {
        await member.kick('🛡️ Warden Global Blacklist').catch(() => null);
    }
});

// --- MESSAGE HANDLER (ANTI-SPAM & WORD FILTER) ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id) || message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || {};
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    if (isAdmin) return;

    // --- DETECTOR DE PALABRAS PROHIBIDAS (NORMALIZADO) ---
    const words = forbiddenWords.get(message.guild.id);
    if (words && words.size > 0) {
        const normalizedContent = normalize(message.content);
        for (const word of words) {
            const normalizedWord = normalize(word);
            if (normalizedContent.includes(normalizedWord)) {
                await message.delete().catch(() => null);
                return message.channel.send(`⚠️ ${message.author}, tu mensaje contiene palabras prohibidas.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    // --- ANTI-SPAM ---
    const now = Date.now();
    const windowMs = (config.spam_seconds || 5) * 1000;
    const limit = config.spam_limit || 5;

    if (!spamMap.has(message.author.id)) {
        spamMap.set(message.author.id, { count: 1, lastMessage: now });
        return;
    }

    const userData = spamMap.get(message.author.id);
    if (now - userData.lastMessage < windowMs) { userData.count++; } else { userData.count = 1; }
    userData.lastMessage = now;

    if (userData.count >= limit) {
        userData.count = 0;
        try {
            const msgs = await message.channel.messages.fetch({ limit: 15 });
            await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
            await message.member.timeout(600000, 'Anti-Spam Triggered');
            message.channel.send(`🛡️ **Warden:** ${message.author} muteado por spam.`);
        } catch (err) { console.error('Anti-spam error ignored.'); }
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel, user } = interaction;

    if (blacklistedUsers.has(user.id)) return; 

    const isOwner = user.id === OWNER_ID;
    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed', 'badwords-list'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const sendGlobalLog = (title, desc, color) => {
        const conf = localConfig.get(guild.id);
        if (!conf || !conf.log_channel) return;
        const logChannel = guild.channels.cache.get(conf.log_channel);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(`📝 Log: ${title}`).setDescription(`${desc}\n\n**Mod:** ${member.user.tag}\n**Channel:** ${channel}`)
                .setColor(color).setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
    };

    const quickEmbed = (title, desc, color = '#ffffff', logIt = false) => {
        if (logIt) sendGlobalLog(title, desc, color);
        return interaction.editReply({ 
            embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] 
        }).catch(() => null);
    };

    // --- COMANDOS DE PALABRAS PROHIBIDAS ---
    if (commandName.startsWith('badwords')) {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages) && !isOwner) return quickEmbed('❌ Denegado', 'No tienes permiso.', '#ff0000');
        
        let words = forbiddenWords.get(guild.id) || new Set();

        if (commandName === 'badwords-add') {
            const word = options.getString('word').toLowerCase();
            words.add(word);
            forbiddenWords.set(guild.id, words);
            return quickEmbed('✅ Filtro Actualizado', `Se ha bloqueado la palabra: \`${word}\``, '#2ecc71', true);
        }

        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            words.delete(word);
            forbiddenWords.set(guild.id, words);
            return quickEmbed('🗑️ Filtro Actualizado', `Se ha eliminado la palabra: \`${word}\``, '#e67e22', true);
        }

        if (commandName === 'badwords-list') {
            const list = Array.from(words).map(w => `• ${w}`).join('\n') || 'No hay palabras bloqueadas.';
            return quickEmbed('📜 Lista de Palabras Prohibidas', list, '#3498db');
        }
    }

    // --- EVAL ---
    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed('❌ Critical Access Denied', 'Direct Terminal Access is restricted to the System Developer.', '#ff0000');
        try {
            const code = options.getString('code');
            let evalued = await eval(code);
            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });
            if (evalued.includes(TOKEN)) evalued = "Error: Tokens blocked.";
            const evalEmbed = new EmbedBuilder()
                .setTitle('💻 System Console Output')
                .addFields({ name: '📥 Input', value: `\`\`\`js\n${code}\n\`\`\`` }, { name: '📤 Output', value: `\`\`\`js\n${evalued.substring(0, 1014)}\n\`\`\`` })
                .setColor('#2ecc71').setTimestamp();
            return interaction.editReply({ embeds: [evalEmbed] });
        } catch (e) { return quickEmbed('💻 Console Error', `\`\`\`js\n${e.message}\n\`\`\``, '#e74c3c'); }
    }

    // --- BLACKLIST ---
    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed('❌ Access Denied', 'Restricted to System Developer.', '#ff0000');
        const action = options.getString('action');
        const target = options.getUser('user');
        if (action === 'add') {
            blacklistedUsers.add(target.id);
            return quickEmbed('🚫 Global Blacklist', `User **${target.tag}** blacklisted.`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed('✅ Removed', `User **${target.tag}** restored.`, '#2ecc71');
        }
    }

    // --- OTROS COMANDOS ---
    try {
        switch (commandName) {
            case 'broadcast':
                if (!isOwner) return quickEmbed('❌ Access Denied', 'Restricted.', '#ff0000');
                let successCount = 0;
                client.guilds.cache.forEach(g => {
                    const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me).has(PermissionFlagsBits.SendMessages));
                    if (ch) {
                        ch.send({ embeds: [new EmbedBuilder().setTitle(options.getString('title') || '🚨 Announcement').setDescription(options.getString('message')).setColor('#f1c40f')] }).catch(() => null);
                        successCount++;
                    }
                });
                return quickEmbed('📢 Broadcast', `Sent to ${successCount} servers.`, '#2ecc71');

            case 'slowmode':
                await channel.setRateLimitPerUser(options.getInteger('seconds'));
                return quickEmbed('⏲️ Slowmode', `Set to ${options.getInteger('seconds')}s.`, '#3498db', true);

            case 'purge':
                const pFetched = await channel.messages.fetch({ limit: Math.min(options.getInteger('amount'), 100) });
                const pToDelete = options.getUser('user') ? pFetched.filter(m => m.author.id === options.getUser('user').id) : pFetched;
                const pDeleted = await channel.bulkDelete(pToDelete, true);
                return quickEmbed('🧹 Purge', `Deleted ${pDeleted.size} messages.`, '#95a5a6', true);

            case 'ban':
                const bUser = options.getUser('user');
                await guild.members.ban(bUser, { reason: options.getString('reason') || 'None' });
                return quickEmbed('🔨 Ban', `${bUser.tag} banned.`, '#ff0000', true);

            case 'warn':
                const warns = localWarns.get(options.getUser('user').id) || [];
                warns.push({ date: new Date().toLocaleDateString(), reason: options.getString('reason') });
                localWarns.set(options.getUser('user').id, warns);
                return quickEmbed('⚠️ Warn', `${options.getUser('user').tag} warned. Total: ${warns.length}`, '#f1c40f', true);

            case 'lock':
            case 'unlock':
                const isLock = commandName === 'lock';
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isLock });
                return quickEmbed(isLock ? '🔐 Locked' : '🔓 Unlocked', 'Channel state updated.', isLock ? '#ff0000' : '#2ecc71', true);

            case 'audit':
                const aTarget = options.getMember('user');
                const age = Math.floor((Date.now() - aTarget.user.createdTimestamp) / 86400000);
                const auditEmbed = new EmbedBuilder()
                    .setTitle(`Audit: ${aTarget.user.username}`).setColor(age > 30 ? '#2ecc71' : '#ff0000')
                    .addFields({ name: 'ID', value: aTarget.user.id }, { name: 'Age', value: `${age} days` }, { name: 'Safety', value: age > 30 ? '✅ SAFE' : '⚠️ NEW ACCOUNT' });
                return interaction.editReply({ embeds: [auditEmbed] });

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Sent.' });

            case 'flip':
                return quickEmbed('🪙 Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');
        }
    } catch (err) {
        return quickEmbed('❌ Error', err.message, '#ff0000');
    }
});

process.on('unhandledRejection', r => console.error('🛡️ Rejection:', r));
process.on('uncaughtException', e => console.error('🛡️ Exception:', e));

client.login(TOKEN);
