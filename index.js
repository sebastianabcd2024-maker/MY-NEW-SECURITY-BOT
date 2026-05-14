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

// --- LOCAL STORAGE ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 
const blacklistedUsers = new Set(); // Global Blacklist System
const forbiddenWords = new Map(); // Forbidden words storage per guild (Stores: {word: string, level: number})
const linkWhitelist = new Map(); // Domain Whitelist per guild

// --- HELPER: ADVANCED NORMALIZATION ---
const normalize = (text) => {
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, "")    // Remove special characters
        .split(/\s+/);                  // Array of words
};

// --- HELPER: ANTI-BYPASS (LEVEL 3) ---
const bypassCheck = (text) => {
    return text.toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
        .replace(/8/g, 'b').replace(/v/g, 'u').replace(/\W|_/g, '');
};

// --- COMMAND REGISTRATION ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v5.1 [ANTI-LINK TOGGLE] | Online`);

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
    }
});

// --- ANTI-SPAM, WORD FILTER & ANTI-LINK ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id)) return; 
    if (message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5, antilinks_enabled: false };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

    // --- ANTI-LINK SYSTEM ---
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
                    shouldDelete = true; // Delete malformed links that still trigger regex
                    break;
                }
            }

            if (shouldDelete) {
                await message.delete().catch(() => null);
                return message.channel.send(`🚫 ${message.author}, links are not allowed here.`)
                    .then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    // --- MULTI-LEVEL WORD FILTER ---
    const serverWordsMap = forbiddenWords.get(message.guild.id);
    if (serverWordsMap && serverWordsMap.size > 0) {
        const messageWords = normalize(message.content);
        const ultraClean = bypassCheck(message.content);

        let detected = false;
        for (const [forbidden, level] of serverWordsMap) {
            const cleanForbidden = forbidden.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

            if (level === 1 && messageWords.includes(cleanForbidden)) detected = true;
            if (level === 2 && message.content.toLowerCase().includes(cleanForbidden)) detected = true;
            if (level === 3 && ultraClean.includes(bypassCheck(cleanForbidden))) detected = true;

            if (detected) break;
        }

        if (detected) {
            await message.delete().catch(() => null);
            return message.channel.send(`⚠️ ${message.author}, that word is restricted here.`)
                .then(m => setTimeout(() => m.delete(), 3000));
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
            message.channel.send(`🛡️ **Warden:** ${message.author} muted for spamming.`);
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

    // --- BADWORDS COMMANDS ---
    if (commandName.startsWith('badwords')) {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageMessages) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('❌ Access Denied', 'You do not have permission to manage the filter.', '#ff0000');

        let currentWordsMap = forbiddenWords.get(guild.id) || new Map();

        if (commandName === 'badwords-add') {
            const word = options.getString('word').toLowerCase();
            const level = options.getInteger('level');
            currentWordsMap.set(word, level);
            forbiddenWords.set(guild.id, currentWordsMap);
            return quickEmbed('🚫 Word Blocked', `The word \`${word}\` added with **Level ${level}**.`, '#2ecc71', true);
        }
        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            if (currentWordsMap.delete(word)) {
                forbiddenWords.set(guild.id, currentWordsMap);
                return quickEmbed('✅ Word Removed', `The word \`${word}\` is no longer blocked.`, '#3498db', true);
            }
            return quickEmbed('❌ Error', 'That word was not in the list.', '#ff0000');
        }
        if (commandName === 'badwords-list') {
            const list = Array.from(currentWordsMap.entries())
                .map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'No blocked words found.';
            return quickEmbed('📜 Blocklist', list, '#f1c40f');
        }
    }

    // --- LINK WHITELIST & SETUP COMMANDS ---
    if (commandName.startsWith('link-whitelist') || commandName === 'setup-antilinks') {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (commandName !== 'link-whitelist-list' && !hasAuth) return quickEmbed('❌ Access Denied', 'Requires Manage Server permissions.', '#ff0000');

        if (commandName === 'setup-antilinks') {
            const isEnabled = options.getBoolean('enabled');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), antilinks_enabled: isEnabled });
            return quickEmbed(isEnabled ? '🛡️ Anti-Links Enabled' : '🔓 Anti-Links Disabled', `The system will ${isEnabled ? 'now' : 'no longer'} filter external links.`, isEnabled ? '#2ecc71' : '#e74c3c', true);
        }

        let currentWhitelist = linkWhitelist.get(guild.id) || new Set();

        if (commandName === 'link-whitelist-add') {
            const domain = options.getString('domain').toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
            currentWhitelist.add(domain);
            linkWhitelist.set(guild.id, currentWhitelist);
            return quickEmbed('🔗 Domain Whitelisted', `Domain \`${domain}\` is now allowed.`, '#2ecc71', true);
        }
        if (commandName === 'link-whitelist-remove') {
            const domain = options.getString('domain').toLowerCase();
            if (currentWhitelist.delete(domain)) {
                linkWhitelist.set(guild.id, currentWhitelist);
                return quickEmbed('🗑️ Domain Removed', `Domain \`${domain}\` removed from whitelist.`, '#e74c3c', true);
            }
            return quickEmbed('❌ Error', 'Domain not found in whitelist.', '#ff0000');
        }
        if (commandName === 'link-whitelist-list') {
            const list = Array.from(currentWhitelist).map(d => `• \`${d}\``).join('\n') || 'No domains whitelisted.';
            return quickEmbed('📜 Whitelisted Domains', list, '#3498db');
        }
    }

    // --- MASTER COMMAND: EVAL ---
    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed('❌ Critical Access Denied', 'Direct Terminal Access is restricted to the System Developer.', '#ff0000');

        try {
            const code = options.getString('code');
            let evalued = await eval(code);

            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });

            if (evalued.includes(client.token) || evalued.includes(TOKEN)) {
                evalued = "Error: Output contains sensitive bot tokens. Execution blocked.";
            }

            const evalEmbed = new EmbedBuilder()
                .setTitle('💻 System Console Output')
                .addFields(
                    { name: '📥 Input', value: `\`\`\`js\n${code}\n\`\`\`` },
                    { name: '📤 Output', value: `\`\`\`js\n${evalued.substring(0, 1014)}\n\`\`\`` }
                )
                .setColor('#2ecc71')
                .setTimestamp();

            return interaction.editReply({ embeds: [evalEmbed] });
        } catch (e) {
            return quickEmbed('💻 Console Error', `\`\`\`js\n${e.message}\n\`\`\``, '#e74c3c');
        }
    }

    // --- OWNER COMMAND: BLACKLIST ---
    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed('❌ Access Denied', 'Restricted to System Developer.', '#ff0000');
        const action = options.getString('action');
        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason specified';

        if (action === 'add') {
            if (target.id === OWNER_ID) return quickEmbed('❌ Error', 'You cannot blacklist yourself.', '#ff0000');
            blacklistedUsers.add(target.id);
            return quickEmbed('🚫 Global Blacklist', `User **${target.tag}** has been blacklisted.\n**Reason:** ${reason}`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed('✅ Blacklist Removed', `User **${target.tag}** is no longer blacklisted.`, '#2ecc71');
        }
    }

    // --- OWNER COMMAND: BROADCAST ---
    if (commandName === 'broadcast') {
        if (!isOwner) return quickEmbed('❌ Access Denied', 'This command is restricted to the System Developer.', '#ff0000');
        const bMsg = options.getString('message');
        const bTitle = options.getString('title') || '🚨 Warden Systems: Global Announcement';

        let successCount = 0;
        client.guilds.cache.forEach(g => {
            const conf = localConfig.get(g.id);
            const targetChannel = g.channels.cache.get(conf?.log_channel) || g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me).has(PermissionFlagsBits.SendMessages));

            if (targetChannel) {
                const bEmbed = new EmbedBuilder().setTitle(bTitle).setDescription(bMsg).setColor('#f1c40f').setFooter({ text: 'Broadcast sent by System Owner' }).setTimestamp();
                targetChannel.send({ embeds: [bEmbed] }).catch(() => null);
                successCount++;
            }
        });
        return quickEmbed('📢 Broadcast Sent', `Announcement delivered to **${successCount}** servers.`, '#2ecc71');
    }

    const config = localConfig.get(guild.id);
    const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));

    if (!['audit', 'flip', 'color', 'embed', 'badwords-list', 'link-whitelist-list'].includes(commandName) && !hasAuth) {
        return quickEmbed('❌ Access Denied', 'Unauthorized access.', '#ff0000');
    }

    try {
        switch (commandName) {
            case 'slowmode':
                const seconds = options.getInteger('seconds');
                const sReason = options.getString('reason') || 'No reason provided';
                await channel.setRateLimitPerUser(seconds, sReason);
                return quickEmbed('⏲️ Slowmode Updated', `The slowmode has been set to **${seconds}** seconds.\n**Reason:** ${sReason}`, '#3498db', true);

            case 'purge':
                const pAmount = Math.min(options.getInteger('amount'), 100);
                const pTarget = options.getUser('user');
                const pFetched = await channel.messages.fetch({ limit: pAmount });
                let pToDelete = pTarget ? pFetched.filter(m => m.author.id === pTarget.id) : pFetched;
                if (pToDelete.size === 0) throw new Error('No messages found to delete.');
                const pDeleted = await channel.bulkDelete(pToDelete, true);
                return quickEmbed('🧹 Purge', `Deleted **${pDeleted.size}** messages${pTarget ? ` from ${pTarget.tag}` : ''}.`, '#95a5a6', true);

            case 'purge-after':
                const msgId = options.getString('message_id');
                const paFetched = await channel.messages.fetch({ after: msgId, limit: 100 });
                if (paFetched.size === 0) throw new Error('No messages found after this ID.');
                const paDeleted = await channel.bulkDelete(paFetched, true);
                return quickEmbed('🧹 Purge After', `Deleted **${paDeleted.size}** messages sent after ID: \`${msgId}\`.`, '#95a5a6', true);

            case 'setup-antispam':
                const saLimit = options.getInteger('limit');
                const saSeconds = options.getInteger('seconds');
                const saImmune = options.getRole('immune_role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), spam_limit: saLimit, spam_seconds: saSeconds, immune_role_id: saImmune?.id || null });
                return quickEmbed('🛡️ Anti-Spam Configured', `**Limit:** ${saLimit} msgs\n**Window:** ${saSeconds}s\n**Immune:** ${saImmune || 'None'}`, '#2ecc71', true);

            case 'create-role':
                const rName = options.getString('name');
                const rColor = options.getString('color') || '#95a5a6';
                const rLevel = options.getString('level');
                let perms = []; let hoist = false;
                switch (rLevel) {
                    case 'member': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]; break;
                    case 'moderator': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers]; hoist = true; break;
                    case 'senior_mod': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.BanMembers]; hoist = true; break;
                    case 'administrator': perms = [PermissionFlagsBits.Administrator]; hoist = true; break;
                    case 'developer': perms = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild]; hoist = true; break;
                    default: perms = [PermissionFlagsBits.ViewChannel]; break;
                }
                const newRole = await guild.roles.create({ name: rName, color: rColor.startsWith('#') ? rColor : '#95a5a6', permissions: perms, hoist: hoist });
                return quickEmbed('🎭 Role Created', `**Name:** ${newRole}\n**Level:** ${rLevel || 'Decoration'}`, newRole.hexColor, true);

            case 'set-admin-role':
                const role = options.getRole('role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: role.id });
                return quickEmbed('✅ Security Updated', `Admin role set to: **${role.name}**`, '#2ecc71');

            case 'set-logs':
                const logChan = options.getChannel('channel');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), log_channel: logChan.id });
                return quickEmbed('📁 Logs Configured', `Logs will be sent to ${logChan}`, '#3498db');

            case 'ban':
                const bUser = options.getUser('user');
                const bMember = await guild.members.fetch(bUser.id).catch(() => null);
                if (!isOwner && bMember && bMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot ban a user with an equal or higher role.', '#ff0000');
                }
                const bReason = options.getString('reason') || 'No reason provided';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed('🔨 Ban Applied', `**Target:** ${bUser.tag}\n**Reason:** ${bReason}`, '#ff0000', true);

            case 'unban':
                const uId = options.getString('user_id');
                await guild.members.unban(uId);
                return quickEmbed('🔓 Unbanned', `ID \`${uId}\` has been unbanned.`, '#2ecc71', true);

            case 'kick':
                const kMember = options.getMember('user');
                if (!kMember || !kMember.kickable) throw new Error('Cannot kick this user.');
                if (!isOwner && kMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot kick a user with an equal or higher role.', '#ff0000');
                }
                const kReason = options.getString('reason') || 'No reason provided';
                await kMember.kick(kReason);
                return quickEmbed('🚀 Kicked', `User **${kMember.user.tag}** removed.\n**Reason:** ${kReason}`, '#e67e22', true);

            case 'warn':
                const wUser = options.getUser('user');
                const wMember = await guild.members.fetch(wUser.id).catch(() => null);
                if (!isOwner && wMember && wMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot warn a user with an equal or higher role.', '#ff0000');
                }
                const warns = localWarns.get(wUser.id) || [];
                const wReason = options.getString('reason') || 'No reason provided';
                warns.push({ date: new Date().toLocaleDateString(), reason: wReason });
                localWarns.set(wUser.id, warns);
                return quickEmbed('⚠️ Warning Issued', `**Target:** ${wUser}\n**Reason:** ${wReason}\n**Total Warns:** ${warns.length}`, '#f1c40f', true);

            case 'infractions':
                const iUser = options.getUser('user');
                const iHistory = localWarns.get(iUser.id) || [];
                const iList = iHistory.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') || 'No infractions found.';
                return quickEmbed(`Infractions: ${iUser.tag}`, iList, '#3498db');

            case 'timeout':
                const tMember = options.getMember('user');
                if (!tMember || !tMember.manageable) throw new Error('Cannot mute this user.');
                if (!isOwner && tMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot mute a user with an equal or higher role.', '#ff0000');
                }
                const tMin = options.getInteger('minutes');
                const tReason = options.getString('reason') || 'No reason provided';
                await tMember.timeout(tMin * 60000, tReason);
                return quickEmbed('⏳ Timeout', `${tMember.user.tag} muted for ${tMin}m.\n**Reason:** ${tReason}`, '#e67e22', true);

            case 'unmute':
                const umMember = options.getMember('user');
                if (!isOwner && umMember && umMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot unmute a user with an equal or higher role.', '#ff0000');
                }
                await umMember?.timeout(null);
                return quickEmbed('🔊 Unmuted', `${umMember?.user.tag} access restored.`, '#2ecc71', true);

            case 'lock':
            case 'unlock':
                const isLock = commandName === 'lock';
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: !isLock,
                    AddReactions: !isLock,
                    CreatePublicThreads: !isLock,
                    CreatePrivateThreads: !isLock,
                    SendMessagesInThreads: !isLock,
                    UseExternalEmojis: !isLock,
                    UseExternalStickers: !isLock
                });
                return quickEmbed(isLock ? '🔐 Channel Locked' : '🔓 Channel Unlocked', isLock ? 'Full restriction applied (Read-only).' : 'Interactions restored.', isLock ? '#ff0000' : '#2ecc71', true);

            case 'audit':
                const aTarget = options.getMember('user');
                if (!aTarget) throw new Error('User not found.');
                const accountAgeDays = Math.floor((Date.now() - aTarget.user.createdTimestamp) / 86400000);
                const joinedServerDays = Math.floor((Date.now() - aTarget.joinedTimestamp) / 86400000);
                const joinedDiscordStr = accountAgeDays > 365 ? `${Math.floor(accountAgeDays / 365)} years ago` : `${accountAgeDays} days ago`;
                const joinedServerStr = joinedServerDays < 1 ? "today" : (joinedServerDays > 30 ? `${Math.floor(joinedServerDays / 30)} months ago` : `${joinedServerDays} days ago`);

                const auditEmbed = new EmbedBuilder()
                    .setAuthor({ name: `Audit Report: ${aTarget.user.username}`, iconURL: aTarget.user.displayAvatarURL() })
                    .setThumbnail('https://i.imgur.com/8Nf9yUn.png') 
                    .setColor(accountAgeDays > 30 ? '#2ecc71' : '#ff0000')
                    .addFields(
                        { name: '🆔 User ID', value: `**${aTarget.user.id}**` },
                        { name: '🔝 Highest Role', value: `${aTarget.roles.highest}` },
                        { name: '🛡️ Admin Perms', value: `**${aTarget.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No'}**` },
                        { name: '📅 Joined Discord', value: `**${joinedDiscordStr}**` },
                        { name: '📥 Joined Server', value: `**${joinedServerStr}**` },
                        { name: '⚖️ Security Status', value: accountAgeDays > 30 ? '✅ **SAFE**' : '⚠️ **SUSPICIOUS**' }
                    ).setFooter({ text: `Account Age: ${accountAgeDays} days` });
                return interaction.editReply({ embeds: [auditEmbed] });

            case 'role-give':
            case 'role-take':
                const rgMember = options.getMember('user');
                const rgRole = options.getRole('role');
                if (!isOwner) {
                    if (rgMember.roles.highest.position >= member.roles.highest.position) {
                        return quickEmbed('❌ Hierarchy Error', 'You cannot modify roles of a user with an equal or higher role.', '#ff0000');
                    }
                    if (rgRole.position >= member.roles.highest.position) {
                        return quickEmbed('❌ Hierarchy Error', 'You cannot manage a role that is equal or higher than yours.', '#ff0000');
                    }
                }
                commandName === 'role-give' ? await rgMember.roles.add(rgRole) : await rgMember.roles.remove(rgRole);
                return quickEmbed('🎭 Role Updated', `Target: ${rgMember.user.tag}`, '#3498db', true);

            case 'create-channel':
                const cType = options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
                const newChan = await guild.channels.create({ name: options.getString('name'), type: cType });
                return quickEmbed('✨ Channel Created', `New channel: ${newChan}`, '#2ecc71', true);

            case 'color':
                const cHex = options.getString('input');
                return quickEmbed('🎨 Color Info', `Color: **${cHex}**`, cHex.startsWith('#') ? cHex : '#ffffff');

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Message sent.' });

            case 'flip':
                return quickEmbed('🪙 Coin Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');

            case 'embed':
                const customEmbed = new EmbedBuilder().setDescription(options.getString('description')).setColor(options.getString('color') || '#ffffff');
                if (options.getString('title')) customEmbed.setTitle(options.getString('title'));
                return interaction.editReply({ embeds: [customEmbed] });

            default:
                return quickEmbed('❓ Unknown', 'Command not found.', '#7289da');
        }
    } catch (err) {
        console.error(err);
        return quickEmbed('❌ System Error', `Failed: \`${err.message}\``, '#ff0000');
    }
});

process.on('unhandledRejection', r => console.error('🛡️ Rejection:', r));
process.on('uncaughtException', e => console.error('🛡️ Exception:', e));

client.login(TOKEN);
