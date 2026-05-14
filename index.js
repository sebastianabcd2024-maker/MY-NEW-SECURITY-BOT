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

// --- HELPER: AUTO-MOD LOGGING (Mantenido intacto) ---
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
                { name: '💬 Content Trigger', value: `\`\`\`${content.substring(0, 500) || "N/A"}\`\`\`` }
            )
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
};

// --- COMMAND REGISTRATION (Mantenido v5.5) ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v5.5 [FULL LOGIC + ICON UI] | Online`);

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
        sendAutoModLog(member.guild, member.user, 'Global Blacklist Kick', 'User is in the global blacklist.', 'N/A', '#000000');
    }
});

// --- AUTO-MODERATION ENGINE ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id)) return; 
    if (message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5, antilinks_enabled: false, flood_enabled: false, flood_max: 3 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

    // --- ANTI-FLOOD ---
    if (config.flood_enabled) {
        const userFlood = floodMap.get(message.author.id) || { lastContent: "", count: 0 };
        if (message.content === userFlood.lastContent && message.content.length > 2) {
            userFlood.count++;
            if (userFlood.count >= (config.flood_max || 3)) {
                userFlood.count = 0;
                await message.delete().catch(() => null);
                await message.member.timeout(300000, 'Anti-Flood: Repetitive messages');
                sendAutoModLog(message.guild, message.author, 'Anti-Flood', 'Sent too many identical messages.', message.content);
                return message.channel.send(`${ICONS.error} ${message.author}, stop flooding with the same message.`);
            }
        } else {
            userFlood.lastContent = message.content;
            userFlood.count = 1;
        }
        floodMap.set(message.author.id, userFlood);
    }

    // --- ANTI-LINK ---
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
                return message.channel.send(`${ICONS.error} ${message.author}, links are not allowed here.`)
                    .then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    // --- WORD FILTER ---
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
            sendAutoModLog(message.guild, message.author, 'Word Filter', `Used restricted word: ${detectedWord}`, message.content, '#ff4444');
            return message.channel.send(`${ICONS.warn} ${message.author}, that word is restricted here.`)
                .then(m => setTimeout(() => m.delete(), 3000));
        }
    }

    // --- ANTI-SPAM ---
    const now = Date.now();
    const windowMs = (config.spam_seconds || 5) * 1000;
    const limit = config.spam_limit || 5;

    if (!spamMap.has(message.author.id)) {
        spamMap.set(message.author.id, { count: 1, lastMessage: now });
    } else {
        const userData = spamMap.get(message.author.id);
        if (now - userData.lastMessage < windowMs) { userData.count++; } else { userData.count = 1; }
        userData.lastMessage = now;

        if (userData.count >= limit) {
            userData.count = 0;
            try {
                const msgs = await message.channel.messages.fetch({ limit: 15 });
                await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
                await message.member.timeout(600000, 'Anti-Spam Triggered');
                sendAutoModLog(message.guild, message.author, 'Anti-Spam', `Sent more than ${limit} messages in ${config.spam_seconds}s.`, 'Bulk messages deleted.');
                message.channel.send(`${ICONS.timeout} **Warden:** ${message.author} muted for spamming.`);
            } catch (err) { console.error('Anti-spam error ignored.'); }
        }
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

    // --- REEMPLAZO QUICKEMBED (SIN TITULO) ---
    const quickEmbed = (desc, color = '#ffffff', logIt = false, logTitle = "Action") => {
        if (logIt) sendGlobalLog(logTitle, desc, color);
        return interaction.editReply({ 
            embeds: [new EmbedBuilder().setDescription(desc).setColor(color).setTimestamp()] 
        }).catch(() => null);
    };

    // --- BADWORDS COMMANDS ---
    if (commandName.startsWith('badwords')) {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageMessages) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed(`${ICONS.error} You do not have permission to manage the filter.`, '#ff0000');

        let currentWordsMap = forbiddenWords.get(guild.id) || new Map();

        if (commandName === 'badwords-add') {
            const word = options.getString('word').toLowerCase();
            const level = options.getInteger('level');
            currentWordsMap.set(word, level);
            forbiddenWords.set(guild.id, currentWordsMap);
            return quickEmbed(`${ICONS.bankick} Word \`${word}\` added with **Level ${level}**.`, '#2ecc71', true, 'Word Blocked');
        }
        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            if (currentWordsMap.delete(word)) {
                forbiddenWords.set(guild.id, currentWordsMap);
                return quickEmbed(`${ICONS.check} Word \`${word}\` is no longer blocked.`, '#3498db', true, 'Word Removed');
            }
            return quickEmbed(`${ICONS.error} That word was not in the list.`, '#ff0000');
        }
        if (commandName === 'badwords-list') {
            const list = Array.from(currentWordsMap.entries())
                .map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'No blocked words found.';
            return quickEmbed(`📜 **Blocklist:**\n${list}`, '#f1c40f');
        }
    }

    // --- LINK WHITELIST & SETUP COMMANDS ---
    if (commandName.startsWith('link-whitelist') || commandName === 'setup-antilinks' || commandName === 'setup-antiflood') {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (commandName !== 'link-whitelist-list' && !hasAuth) return quickEmbed(`${ICONS.error} Requires Manage Server permissions.`, '#ff0000');

        if (commandName === 'setup-antiflood') {
            const isEnabled = options.getBoolean('enabled');
            const maxDup = options.getInteger('max_duplicates');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), flood_enabled: isEnabled, flood_max: maxDup });
            return quickEmbed(`${ICONS.check} **Anti-Flood Configured**\n**Status:** ${isEnabled ? 'Enabled' : 'Disabled'}\n**Limit:** ${maxDup} repeated messages.`, isEnabled ? '#2ecc71' : '#e74c3c', true, 'Anti-Flood Config');
        }

        if (commandName === 'setup-antilinks') {
            const isEnabled = options.getBoolean('enabled');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), antilinks_enabled: isEnabled });
            return quickEmbed(isEnabled ? `${ICONS.check} Anti-Links Enabled` : `🔓 Anti-Links Disabled`, `The system will ${isEnabled ? 'now' : 'no longer'} filter external links.`, isEnabled ? '#2ecc71' : '#e74c3c', true, 'Anti-Link Config');
        }

        let currentWhitelist = linkWhitelist.get(guild.id) || new Set();

        if (commandName === 'link-whitelist-add') {
            const domain = options.getString('domain').toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
            currentWhitelist.add(domain);
            linkWhitelist.set(guild.id, currentWhitelist);
            return quickEmbed(`${ICONS.check} Domain \`${domain}\` is now allowed.`, '#2ecc71', true, 'Domain Whitelisted');
        }
        if (commandName === 'link-whitelist-remove') {
            const domain = options.getString('domain').toLowerCase();
            if (currentWhitelist.delete(domain)) {
                linkWhitelist.set(guild.id, currentWhitelist);
                return quickEmbed(`${ICONS.bankick} Domain \`${domain}\` removed from whitelist.`, '#e74c3c', true, 'Domain Removed');
            }
            return quickEmbed(`${ICONS.error} Domain not found in whitelist.`, '#ff0000');
        }
        if (commandName === 'link-whitelist-list') {
            const list = Array.from(currentWhitelist).map(d => `• \`${d}\``).join('\n') || 'No domains whitelisted.';
            return quickEmbed(`📜 **Whitelisted Domains:**\n${list}`, '#3498db');
        }
    }

    // --- EVAL & OWNER COMMANDS ---
    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Direct Terminal Access restricted.`, '#ff0000');
        try {
            const code = options.getString('code');
            let evalued = await eval(code);
            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });
            if (evalued.includes(TOKEN)) evalued = "Error: Sensitive data blocked.";
            const evalEmbed = new EmbedBuilder().setTitle('💻 Console').addFields({ name: '📥 Input', value: `\`\`\`js\n${code}\n\`\`\`` }, { name: '📤 Output', value: `\`\`\`js\n${evalued.substring(0, 1014)}\n\`\`\`` }).setColor('#2ecc71');
            return interaction.editReply({ embeds: [evalEmbed] });
        } catch (e) { return quickEmbed(`${ICONS.error} \`\`\`js\n${e.message}\n\`\`\``, '#e74c3c'); }
    }

    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Restricted to System Developer.`, '#ff0000');
        const action = options.getString('action');
        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason specified';
        if (action === 'add') {
            blacklistedUsers.add(target.id);
            return quickEmbed(`${ICONS.bankick} **Global Blacklist**\n**${target.tag}** blacklisted.\n**Reason:** ${reason}`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed(`${ICONS.check} **Blacklist Removed**\n**${target.tag}** restored.`, '#2ecc71');
        }
    }

    // --- MODERATION SWITCH ---
    try {
        switch (commandName) {
            case 'set-logs':
                const logChan = options.getChannel('channel');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), log_channel: logChan.id });
                return quickEmbed(`${ICONS.check} Logs will be sent to ${logChan}`, '#3498db');

            case 'slowmode':
                const seconds = options.getInteger('seconds');
                await channel.setRateLimitPerUser(seconds);
                return quickEmbed(`${ICONS.timeout} Slowmode set to **${seconds}**s.`, '#3498db', true, 'Slowmode Updated');

            case 'purge':
                const pAmount = Math.min(options.getInteger('amount'), 100);
                const pTarget = options.getUser('user');
                const pFetched = await channel.messages.fetch({ limit: pAmount });
                let pToDelete = pTarget ? pFetched.filter(m => m.author.id === pTarget.id) : pFetched;
                const pDeleted = await channel.bulkDelete(pToDelete, true);
                return quickEmbed(`${ICONS.check} Deleted **${pDeleted.size}** messages.`, '#95a5a6', true, 'Purge');

            case 'ban':
                const bUser = options.getUser('user');
                const bReason = options.getString('reason') || 'No reason provided';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed(`${ICONS.bankick} **Ban Applied**\n**Target:** ${bUser.tag}\n**Reason:** ${bReason}`, '#ff0000', true, 'Ban');

            case 'warn':
                const wUser = options.getUser('user');
                const warns = localWarns.get(wUser.id) || [];
                const wReason = options.getString('reason') || 'No reason provided';
                warns.push({ date: new Date().toLocaleDateString(), reason: wReason });
                localWarns.set(wUser.id, warns);
                return quickEmbed(`${ICONS.warn} **Warning Issued**\n**Target:** ${wUser}\n**Total Warns:** ${warns.length}`, '#f1c40f', true, 'Warning Issued');

            case 'timeout':
                const tMember = options.getMember('user');
                const tMin = options.getInteger('minutes');
                await tMember.timeout(tMin * 60000, options.getString('reason') || 'N/A');
                return quickEmbed(`${ICONS.timeout} ${tMember.user.tag} muted for ${tMin}m.`, '#e67e22', true, 'Timeout');

            case 'lock':
            case 'unlock':
                const isLock = commandName === 'lock';
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isLock });
                return quickEmbed(isLock ? `🔐 Channel state: **Locked**` : `🔓 Channel state: **Unlocked**`, isLock ? '#ff0000' : '#2ecc71', true, 'Lockdown');
            
            case 'audit':
                const aTarget = options.getMember('user');
                const accountAgeDays = Math.floor((Date.now() - aTarget.user.createdTimestamp) / 86400000);
                const auditEmbed = new EmbedBuilder()
                    .setAuthor({ name: `Audit: ${aTarget.user.username}`, iconURL: aTarget.user.displayAvatarURL() })
                    .setColor(accountAgeDays > 30 ? '#2ecc71' : '#ff0000')
                    .addFields(
                        { name: '🆔 ID', value: aTarget.user.id, inline: true },
                        { name: '🛡️ Admin', value: aTarget.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No', inline: true },
                        { name: '⚖️ Status', value: accountAgeDays > 30 ? '✅ **SAFE**' : '⚠️ **SUSPICIOUS**' }
                    );
                return interaction.editReply({ embeds: [auditEmbed] });

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Sent.' });
        }
    } catch (err) {
        console.error(err);
        return quickEmbed(`${ICONS.error} Failed: \`${err.message}\``, '#ff0000');
    }
});

process.on('unhandledRejection', r => console.error('🛡️ Rejection:', r));
process.on('uncaughtException', e => console.error('🛡️ Exception:', e));

client.login(TOKEN);
