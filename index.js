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
const OWNER_ID = "1238184110975877130"; // Master Key
const TOKEN = process.env.DISCORD_TOKEN; 

// --- NUEVOS ICONOS PERSONALIZADOS ---
const ICONS = {
    check: "<:check_icon1:1504601887247171605>",
    error: "<:error_icon1:1504603932058714123>",
    warn: "<:warn_icon1:1504605302878769272>",
    timeout: "<:timeout_icon1:1504605891087958147>",
    bankick: "<:bankick_icon1:1504606705596498032>"
};

// --- LOCAL STORAGE ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 
const floodMap = new Map(); 
const blacklistedUsers = new Set(); 
const forbiddenWords = new Map(); 
const linkWhitelist = new Map(); 

// --- HELPER: ADVANCED NORMALIZATION ---
const normalize = (text) => {
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9\s]/g, "")    
        .split(/\s+/);                  
};

// --- HELPER: ANTI-BYPASS (LEVEL 3) ---
const bypassCheck = (text) => {
    return text.toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
        .replace(/8/g, 'b').replace(/v/g, 'u').replace(/\W|_/g, '');
};

// --- HELPER: AUTOMOD LOGGING (MANTENIDO IGUAL) ---
const sendAutoModLog = (guild, user, action, reason, content, color = '#ff9900') => {
    const conf = localConfig.get(guild.id);
    if (!conf || !conf.log_channel) return;
    const logChannel = guild.channels.cache.get(conf.log_channel);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle(`🛡️ Auto-Mod Action: ${action}`)
            .setColor(color)
            .addFields(
                { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
                { name: '📝 Reason', value: reason, inline: true },
                { name: '💬 Content', value: `\`\`\`${content.substring(0, 500) || "N/A"}\`\`\`` }
            )
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
};

// --- COMMAND REGISTRATION ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v5.3 [CLEAN EMBEDS] | Online`);

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
            description: 'Block a specific word or phrase',
            options: [
                { name: 'word', type: 3, description: 'Word to forbid', required: true },
                { name: 'level', type: 4, description: 'Sensitivity Level', required: true, choices: [
                    { name: 'Level 1: Exact Match', value: 1 },
                    { name: 'Level 2: Includes/Partial', value: 2 },
                    { name: 'Level 3: Ultra (Anti-Bypass)', value: 3 }
                ]}
            ]
        },
        {
            name: 'badwords-remove',
            description: 'Unblock a word',
            options: [{ name: 'word', type: 3, description: 'Word to allow', required: true }]
        },
        { name: 'badwords-list', description: 'View the list of forbidden words' },
        {
            name: 'setup-antilinks',
            description: 'Enable or disable the Anti-Link system',
            options: [{ name: 'enabled', type: 5, description: 'True to enable, False to disable', required: true }]
        },
        {
            name: 'link-whitelist-add',
            description: 'Allow a specific domain (e.g. youtube.com)',
            options: [{ name: 'domain', type: 3, description: 'The domain to whitelist', required: true }]
        },
        {
            name: 'link-whitelist-remove',
            description: 'Remove a domain from whitelist',
            options: [{ name: 'domain', type: 3, description: 'The domain to remove', required: true }]
        },
        { name: 'link-whitelist-list', description: 'List all whitelisted domains' },
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
            name: 'setup-antiflood', 
            description: 'Configure Anti-Flood (Repeated messages)', 
            options: [
                { name: 'max_duplicates', type: 4, description: 'Max allowed identical messages', required: true },
                { name: 'enabled', type: 5, description: 'Enable Anti-Flood', required: true }
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

// --- AUTO-KICK PROTECTION SYSTEM ---
client.on(Events.GuildMemberAdd, async (member) => {
    if (blacklistedUsers.has(member.id)) {
        await member.kick('🛡️ Warden Global Blacklist').catch(() => null);
        sendAutoModLog(member.guild, member.user, 'Global Blacklist', 'User attempted to join while blacklisted.', 'N/A', '#000000');
    }
});

// --- ANTI-SPAM, WORD FILTER & ANTI-LINK ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id)) return; 
    if (message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5, antilinks_enabled: false, flood_enabled: false, flood_max: 3 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

    if (config.flood_enabled) {
        const userFlood = floodMap.get(message.author.id) || { lastContent: "", count: 0 };
        if (message.content === userFlood.lastContent && message.content.length > 2) {
            userFlood.count++;
            if (userFlood.count >= (config.flood_max || 3)) {
                userFlood.count = 0;
                await message.delete().catch(() => null);
                await message.member.timeout(300000, 'Anti-Flood: Repetitive messages');
                sendAutoModLog(message.guild, message.author, 'Anti-Flood', 'Repetitive messages (Flood)', message.content);
                return message.channel.send(`${ICONS.error} ${message.author}, stop flooding.`);
            }
        } else {
            userFlood.lastContent = message.content;
            userFlood.count = 1;
        }
        floodMap.set(message.author.id, userFlood);
    }

    if (config.antilinks_enabled) {
        const linkRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
        if (linkRegExp.test(message.content)) {
            const whitelist = linkWhitelist.get(message.guild.id) || new Set();
            const foundLinks = message.content.match(linkRegExp);

            let shouldDelete = false;
            for (const link of foundLinks) {
                try {
                    const url = new URL(link);
                    const domain = url.hostname.replace('www.', '');
                    if (!whitelist.has(domain)) {
                        shouldDelete = true;
                        break;
                    }
                } catch (e) {
                    shouldDelete = true; 
                    break;
                }
            }

            if (shouldDelete) {
                await message.delete().catch(() => null);
                sendAutoModLog(message.guild, message.author, 'Anti-Link', 'Unauthorized link posted.', message.content);
                return message.channel.send(`${ICONS.error} ${message.author}, links unauthorized.`)
                    .then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    const serverWordsMap = forbiddenWords.get(message.guild.id);
    if (serverWordsMap && serverWordsMap.size > 0) {
        const messageWords = normalize(message.content);
        const ultraClean = bypassCheck(message.content);

        let detected = false;
        let detectedWord = "";
        for (const [forbidden, level] of serverWordsMap) {
            const cleanForbidden = forbidden.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

            if (level === 1 && messageWords.includes(cleanForbidden)) detected = true;
            if (level === 2 && message.content.toLowerCase().includes(cleanForbidden)) detected = true;
            if (level === 3 && ultraClean.includes(bypassCheck(cleanForbidden))) detected = true;

            if (detected) {
                detectedWord = forbidden;
                break;
            }
        }

        if (detected) {
            await message.delete().catch(() => null);
            sendAutoModLog(message.guild, message.author, 'Word Filter', `Restricted word: ${detectedWord}`, message.content, '#ff4444');
            return message.channel.send(`${ICONS.warn} ${message.author}, restricted content.`)
                .then(m => setTimeout(() => m.delete(), 3000));
        }
    }

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
            sendAutoModLog(message.guild, message.author, 'Anti-Spam', `Sent ${limit} messages too quickly.`, 'N/A');
            message.channel.send(`${ICONS.timeout} ${message.author} muted for spamming.`);
        } catch (err) { console.error('Anti-spam error ignored.'); }
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel, user } = interaction;

    if (blacklistedUsers.has(user.id)) return; 

    const isOwner = user.id === OWNER_ID;
    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed', 'badwords-list', 'link-whitelist-list'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    // LOGS DE MODERACION (ESTRUCTURA MANTENIDA)
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

    // RESPUESTA DEL BOT (SOLO CONTENIDO, SIN TITULO)
    const quickEmbed = (content, color = '#ffffff', logIt = false, logTitle = "Action", logDesc = "") => {
        if (logIt) sendGlobalLog(logTitle, logDesc || content, color);
        return interaction.editReply({ 
            embeds: [new EmbedBuilder().setDescription(content).setColor(color)] 
        }).catch(() => null);
    };

    if (commandName.startsWith('badwords')) {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageMessages) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed(`${ICONS.error} Access Denied`, '#ff0000');

        let currentWordsMap = forbiddenWords.get(guild.id) || new Map();

        if (commandName === 'badwords-add') {
            const word = options.getString('word').toLowerCase();
            const level = options.getInteger('level');
            currentWordsMap.set(word, level);
            forbiddenWords.set(guild.id, currentWordsMap);
            return quickEmbed(`${ICONS.bankick} Word \`${word}\` blocked (Lvl ${level}).`, '#2ecc71', true, 'Word Blocked', `Added \`${word}\` with Lvl ${level}`);
        }
        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            if (currentWordsMap.delete(word)) {
                forbiddenWords.set(guild.id, currentWordsMap);
                return quickEmbed(`${ICONS.check} Word \`${word}\` removed.`, '#3498db', true, 'Word Removed', `Unblocked \`${word}\``);
            }
            return quickEmbed(`${ICONS.error} Word not found.`, '#ff0000');
        }
        if (commandName === 'badwords-list') {
            const list = Array.from(currentWordsMap.entries())
                .map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'No words blocked.';
            return quickEmbed(`${ICONS.check} **Blocked Words:**\n${list}`, '#f1c40f');
        }
    }

    if (commandName.startsWith('link-whitelist') || commandName === 'setup-antilinks' || commandName === 'setup-antiflood') {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (commandName !== 'link-whitelist-list' && !hasAuth) return quickEmbed(`${ICONS.error} Manage Server required.`, '#ff0000');

        if (commandName === 'setup-antiflood') {
            const isEnabled = options.getBoolean('enabled');
            const maxDup = options.getInteger('max_duplicates');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), flood_enabled: isEnabled, flood_max: maxDup });
            return quickEmbed(`${ICONS.check} Anti-Flood: ${isEnabled ? 'ON' : 'OFF'} (Limit: ${maxDup})`, isEnabled ? '#2ecc71' : '#e74c3c', true, 'Anti-Flood Config', `Enabled: ${isEnabled} | Limit: ${maxDup}`);
        }

        if (commandName === 'setup-antilinks') {
            const isEnabled = options.getBoolean('enabled');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), antilinks_enabled: isEnabled });
            return quickEmbed(isEnabled ? `${ICONS.check} Anti-Links: ON` : `${ICONS.check} Anti-Links: OFF`, isEnabled ? '#2ecc71' : '#e74c3c', true, 'Anti-Link Config', `System set to: ${isEnabled}`);
        }

        let currentWhitelist = linkWhitelist.get(guild.id) || new Set();

        if (commandName === 'link-whitelist-add') {
            const domain = options.getString('domain').toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
            currentWhitelist.add(domain);
            linkWhitelist.set(guild.id, currentWhitelist);
            return quickEmbed(`${ICONS.check} Domain \`${domain}\` allowed.`, '#2ecc71', true, 'Whitelist Add', `Added: ${domain}`);
        }
        if (commandName === 'link-whitelist-remove') {
            const domain = options.getString('domain').toLowerCase();
            if (currentWhitelist.delete(domain)) {
                linkWhitelist.set(guild.id, currentWhitelist);
                return quickEmbed(`${ICONS.check} Domain \`${domain}\` removed.`, '#e74c3c', true, 'Whitelist Remove', `Removed: ${domain}`);
            }
            return quickEmbed(`${ICONS.error} Domain not whitelisted.`, '#ff0000');
        }
        if (commandName === 'link-whitelist-list') {
            const list = Array.from(currentWhitelist).map(d => `• \`${d}\``).join('\n') || 'Empty.';
            return quickEmbed(`${ICONS.check} **Whitelisted Domains:**\n${list}`, '#3498db');
        }
    }

    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Developer Access Only.`, '#ff0000');
        try {
            const code = options.getString('code');
            let evalued = await eval(code);
            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });
            if (evalued.includes(TOKEN)) evalued = "SENSITIVE DATA HIDDEN";
            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`📥 **Input:**\n\`\`\`js\n${code}\n\`\`\`\n📤 **Output:**\n\`\`\`js\n${evalued.substring(0, 800)}\n\`\`\``).setColor('#2ecc71')] });
        } catch (e) {
            return quickEmbed(`${ICONS.error} Error: \`${e.message}\``, '#e74c3c');
        }
    }

    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Developer Only.`, '#ff0000');
        const action = options.getString('action');
        const target = options.getUser('user');
        if (action === 'add') {
            blacklistedUsers.add(target.id);
            return quickEmbed(`${ICONS.bankick} User **${target.tag}** blacklisted globally.`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed(`${ICONS.check} Blacklist removed for **${target.tag}**.`, '#2ecc71');
        }
    }

    if (commandName === 'broadcast') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Developer Only.`, '#ff0000');
        const bMsg = options.getString('message');
        let count = 0;
        client.guilds.cache.forEach(g => {
            const target = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me).has(PermissionFlagsBits.SendMessages));
            if (target) { target.send({ embeds: [new EmbedBuilder().setDescription(bMsg).setColor('#f1c40f').setFooter({ text: 'Warden Broadcast' })] }).catch(() => null); count++; }
        });
        return quickEmbed(`${ICONS.check} Broadcast sent to **${count}** servers.`, '#2ecc71');
    }

    const config = localConfig.get(guild.id);
    const hasAuthMod = isOwner || member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));

    if (!['audit', 'flip', 'color', 'embed', 'badwords-list', 'link-whitelist-list'].includes(commandName) && !hasAuthMod) {
        return quickEmbed(`${ICONS.error} Unauthorized.`, '#ff0000');
    }

    try {
        switch (commandName) {
            case 'slowmode':
                const seconds = options.getInteger('seconds');
                await channel.setRateLimitPerUser(seconds);
                return quickEmbed(`${ICONS.timeout} Slowmode set to **${seconds}s**.`, '#3498db', true, 'Slowmode', `Set to ${seconds}s`);

            case 'purge':
                const pAmount = options.getInteger('amount');
                const pTarget = options.getUser('user');
                const pFetched = await channel.messages.fetch({ limit: pAmount });
                let pToDelete = pTarget ? pFetched.filter(m => m.author.id === pTarget.id) : pFetched;
                const pDeleted = await channel.bulkDelete(pToDelete, true);
                return quickEmbed(`${ICONS.check} Purged **${pDeleted.size}** messages.`, '#95a5a6', true, 'Purge', `Cleared ${pDeleted.size} messages`);

            case 'purge-after':
                const msgId = options.getString('message_id');
                const paFetched = await channel.messages.fetch({ after: msgId, limit: 100 });
                const paDeleted = await channel.bulkDelete(paFetched, true);
                return quickEmbed(`${ICONS.check} Purged **${paDeleted.size}** messages after ID.`, '#95a5a6', true, 'Purge After', `Cleared ${paDeleted.size} msgs`);

            case 'setup-antispam':
                localConfig.set(guild.id, { ...localConfig.get(guild.id), spam_limit: options.getInteger('limit'), spam_seconds: options.getInteger('seconds'), immune_role_id: options.getRole('immune_role')?.id });
                return quickEmbed(`${ICONS.check} Anti-Spam updated.`, '#2ecc71', true, 'Spam Config', `Limit: ${options.getInteger('limit')} msgs`);

            case 'create-role':
                const rNew = await guild.roles.create({ name: options.getString('name'), color: options.getString('color') || '#95a5a6' });
                return quickEmbed(`${ICONS.check} Role ${rNew} created.`, rNew.hexColor, true, 'Role Create', `Name: ${rNew.name}`);

            case 'set-admin-role':
                localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: options.getRole('role').id });
                return quickEmbed(`${ICONS.check} Admin role: **${options.getRole('role').name}**.`, '#2ecc71');

            case 'set-logs':
                localConfig.set(guild.id, { ...localConfig.get(guild.id), log_channel: options.getChannel('channel').id });
                return quickEmbed(`${ICONS.check} Logs set to ${options.getChannel('channel')}.`, '#3498db');

            case 'ban':
                await guild.members.ban(options.getUser('user'), { reason: options.getString('reason') });
                return quickEmbed(`${ICONS.bankick} **${options.getUser('user').tag}** banned.`, '#ff0000', true, 'Ban', `User: ${options.getUser('user').id}`);

            case 'unban':
                await guild.members.unban(options.getString('user_id'));
                return quickEmbed(`${ICONS.check} ID \`${options.getString('user_id')}\` unbanned.`, '#2ecc71', true, 'Unban', `ID: ${options.getString('user_id')}`);

            case 'kick':
                await options.getMember('user').kick();
                return quickEmbed(`${ICONS.bankick} **${options.getMember('user').user.tag}** kicked.`, '#e67e22', true, 'Kick', `User: ${options.getMember('user').id}`);

            case 'warn':
                const warns = localWarns.get(options.getUser('user').id) || [];
                warns.push({ date: new Date().toLocaleDateString(), reason: options.getString('reason') });
                localWarns.set(options.getUser('user').id, warns);
                return quickEmbed(`${ICONS.warn} **${options.getUser('user').tag}** warned. (Total: ${warns.length})`, '#f1c40f', true, 'Warning', `Reason: ${options.getString('reason')}`);

            case 'infractions':
                const iHistory = localWarns.get(options.getUser('user').id) || [];
                const iList = iHistory.map((w, i) => `**${i+1}.** ${w.reason}`).join('\n') || 'None.';
                return quickEmbed(`${ICONS.check} **Warns for ${options.getUser('user').username}:**\n${iList}`, '#3498db');

            case 'timeout':
                await options.getMember('user').timeout(options.getInteger('minutes') * 60000);
                return quickEmbed(`${ICONS.timeout} **${options.getMember('user').user.tag}** muted ${options.getInteger('minutes')}m.`, '#e67e22', true, 'Mute', `Time: ${options.getInteger('minutes')}m`);

            case 'unmute':
                await options.getMember('user').timeout(null);
                return quickEmbed(`${ICONS.check} **${options.getMember('user').user.tag}** unmuted.`, '#2ecc71', true, 'Unmute', 'Mute removed');

            case 'lock':
            case 'unlock':
                const isL = commandName === 'lock';
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isL });
                return quickEmbed(isL ? `🔐 Channel Locked.` : `🔓 Channel Unlocked.`, isL ? '#ff0000' : '#2ecc71', true, 'Lockdown', `Status: ${isL}`);

            case 'audit':
                const aT = options.getMember('user');
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`${ICONS.check} **Audit: ${aT.user.tag}**\n🆔 ID: \`${aT.user.id}\`\n🛡️ Admin: ${aT.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No'}`).setColor('#3498db')] });

            case 'role-give':
            case 'role-take':
                const isG = commandName === 'role-give';
                isG ? await options.getMember('user').roles.add(options.getRole('role')) : await options.getMember('user').roles.remove(options.getRole('role'));
                return quickEmbed(`${ICONS.check} Role **${options.getRole('role').name}** ${isG ? 'added' : 'removed'}.`, '#3498db', true, 'Role Edit', `User: ${options.getMember('user').id}`);

            case 'create-channel':
                const nC = await guild.channels.create({ name: options.getString('name'), type: options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice });
                return quickEmbed(`${ICONS.check} Channel ${nC} created.`, '#2ecc71', true, 'Channel Create', `ID: ${nC.id}`);

            case 'color':
                return quickEmbed(`${ICONS.check} Color info: **${options.getString('input')}**.`, options.getString('input').startsWith('#') ? options.getString('input') : '#ffffff');

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Done.' });

            case 'flip':
                return quickEmbed(`🪙 Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');

            case 'embed':
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(options.getString('description')).setTitle(options.getString('title')).setColor(options.getString('color') || '#ffffff')] });

            default: return quickEmbed(`${ICONS.error} Not found.`, '#ff0000');
        }
    } catch (err) {
        return quickEmbed(`${ICONS.error} Error: \`${err.message}\``, '#ff0000');
    }
});

process.on('unhandledRejection', r => null);
process.on('uncaughtException', e => null);

client.login(TOKEN);
