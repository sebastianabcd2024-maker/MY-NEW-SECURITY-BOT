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

// --- HELPER: AUTOMOD LOGGING (Logs detallados se mantienen) ---
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
    console.log(`🛡️ Warden Systems v5.4 [FULL LOGIC + CLEAN UI] | Online`);
    const commands = [
        { name: 'eval', description: '[OWNER ONLY] Execute JavaScript code', options: [{ name: 'code', type: 3, description: 'Code to run', required: true }] },
        { name: 'blacklist', description: '[OWNER ONLY] Manage global blacklist', options: [{ name: 'action', type: 3, description: 'Add or Remove', required: true, choices: [{name: 'Add', value: 'add'}, {name: 'Remove', value: 'remove'}]}, { name: 'user', type: 6, description: 'Target user', required: true }, { name: 'reason', type: 3, description: 'Reason for blacklist', required: false }] },
        { name: 'badwords-add', description: 'Block a specific word', options: [{ name: 'word', type: 3, description: 'Word to forbid', required: true }, { name: 'level', type: 4, description: 'Level', required: true, choices: [{ name: 'Level 1', value: 1 }, { name: 'Level 2', value: 2 }, { name: 'Level 3', value: 3 }]}]},
        { name: 'badwords-remove', description: 'Unblock a word', options: [{ name: 'word', type: 3, description: 'Word to allow', required: true }] },
        { name: 'badwords-list', description: 'View blocked words' },
        { name: 'setup-antilinks', description: 'Enable/Disable Anti-Link', options: [{ name: 'enabled', type: 5, description: 'State', required: true }] },
        { name: 'link-whitelist-add', description: 'Allow domain', options: [{ name: 'domain', type: 3, description: 'Domain', required: true }] },
        { name: 'link-whitelist-remove', description: 'Remove domain', options: [{ name: 'domain', type: 3, description: 'Domain', required: true }] },
        { name: 'link-whitelist-list', description: 'List domains' },
        { name: 'broadcast', description: '[OWNER ONLY] Global Announcement', options: [{ name: 'message', type: 3, description: 'Text', required: true }, { name: 'title', type: 3, description: 'Title', required: false }] },
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'set-logs', description: 'Setup logs channel', options: [{ name: 'channel', type: 7, description: 'Channel', required: true }] },
        { name: 'setup-antispam', description: 'Config Anti-Spam', options: [{ name: 'limit', type: 4, description: 'Limit', required: true }, { name: 'seconds', type: 4, description: 'Time', required: true }, { name: 'immune_role', type: 8, description: 'Immune Role', required: false }] },
        { name: 'setup-antiflood', description: 'Config Anti-Flood', options: [{ name: 'max_duplicates', type: 4, description: 'Limit', required: true }, { name: 'enabled', type: 5, description: 'State', required: true }] },
        { name: 'slowmode', description: 'Set slowmode', options: [{ name: 'seconds', type: 4, description: 'Seconds', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'audit', description: 'Security analysis', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'ban', description: 'Ban user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban ID', options: [{ name: 'user_id', type: 3, description: 'ID', required: true }] },
        { name: 'kick', description: 'Kick user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove timeout', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'role-give', description: 'Add role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'create-role', description: 'Role creator', options: [{ name: 'name', type: 3, description: 'Name', required: true }, { name: 'color', type: 3, description: 'Hex' }, { name: 'level', type: 3, description: 'Tier', choices: [{ name: 'Decoration', value: 'decoration' }, { name: 'Member', value: 'member' }, { name: 'Moderator', value: 'moderator' }, { name: 'Senior Moderator', value: 'senior_mod' }, { name: 'Administrator', value: 'administrator' }, { name: 'Developer', value: 'developer' }] }] },
        { name: 'create-channel', description: 'Create a channel', options: [{ name: 'name', type: 3, description: 'Name', required: true }, { name: 'type', type: 3, description: 'Text or Voice', required: true, choices: [{ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }] }]},
        { name: 'purge', description: 'Delete messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }, { name: 'user', type: 6, description: 'User' }] },
        { name: 'purge-after', description: 'Delete messages after ID', options: [{ name: 'message_id', type: 3, description: 'ID', required: true }] },
        { name: 'lock', description: 'Lock channel' },
        { name: 'unlock', description: 'Unlock channel' },
        { name: 'color', description: 'Color info', options: [{ name: 'input', type: 3, description: 'Hex', required: true }] },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Text', required: true }] },
        { name: 'flip', description: 'Coin flip' },
        { name: 'embed', description: 'Custom embed', options: [{ name: 'description', type: 3, description: 'Content', required: true }, { name: 'title', type: 3, description: 'Title' }, { name: 'color', type: 3, description: 'Hex' }, { name: 'thumbnail', type: 3, description: 'URL' }, { name: 'image', type: 3, description: 'URL' }] }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- EVENTS: AUTO-KICK ---
client.on(Events.GuildMemberAdd, async (member) => {
    if (blacklistedUsers.has(member.id)) {
        await member.kick('🛡️ Warden Global Blacklist').catch(() => null);
        sendAutoModLog(member.guild, member.user, 'Global Blacklist', 'User attempted join.', 'N/A', '#000000');
    }
});

// --- MESSAGE FILTERS ---
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
                await message.member.timeout(300000, 'Anti-Flood');
                sendAutoModLog(message.guild, message.author, 'Anti-Flood', 'Repeated messages', message.content);
                return message.channel.send(`${ICONS.error} ${message.author}, stop flooding.`);
            }
        } else { userFlood.lastContent = message.content; userFlood.count = 1; }
        floodMap.set(message.author.id, userFlood);
    }

    if (config.antilinks_enabled) {
        const linkRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/gi;
        if (linkRegExp.test(message.content)) {
            const whitelist = linkWhitelist.get(message.guild.id) || new Set();
            const foundLinks = message.content.match(linkRegExp);
            let shouldDelete = false;
            for (const link of foundLinks) {
                try {
                    const domain = new URL(link).hostname.replace('www.', '');
                    if (!whitelist.has(domain)) { shouldDelete = true; break; }
                } catch (e) { shouldDelete = true; break; }
            }
            if (shouldDelete) {
                await message.delete().catch(() => null);
                sendAutoModLog(message.guild, message.author, 'Anti-Link', 'Unauthorized link', message.content);
                return message.channel.send(`${ICONS.error} ${message.author}, links unauthorized.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    const serverWordsMap = forbiddenWords.get(message.guild.id);
    if (serverWordsMap?.size > 0) {
        const messageWords = normalize(message.content);
        const ultraClean = bypassCheck(message.content);
        let detected = false;
        for (const [forbidden, level] of serverWordsMap) {
            const cleanForbidden = forbidden.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
            if (level === 1 && messageWords.includes(cleanForbidden)) detected = true;
            if (level === 2 && message.content.toLowerCase().includes(cleanForbidden)) detected = true;
            if (level === 3 && ultraClean.includes(bypassCheck(cleanForbidden))) detected = true;
            if (detected) {
                await message.delete().catch(() => null);
                sendAutoModLog(message.guild, message.author, 'Word Filter', `Word: ${forbidden}`, message.content, '#ff4444');
                return message.channel.send(`${ICONS.warn} ${message.author}, restricted content.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    const now = Date.now();
    const windowMs = (config.spam_seconds || 5) * 1000;
    const limit = config.spam_limit || 5;
    if (!spamMap.has(message.author.id)) { spamMap.set(message.author.id, { count: 1, lastMessage: now }); return; }
    const userData = spamMap.get(message.author.id);
    if (now - userData.lastMessage < windowMs) { userData.count++; } else { userData.count = 1; }
    userData.lastMessage = now;
    if (userData.count >= limit) {
        userData.count = 0;
        try {
            const msgs = await message.channel.messages.fetch({ limit: 15 });
            await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
            await message.member.timeout(600000, 'Anti-Spam');
            sendAutoModLog(message.guild, message.author, 'Anti-Spam', `Sent ${limit} msgs quickly`, 'N/A');
            message.channel.send(`${ICONS.timeout} ${message.author} muted for spamming.`);
        } catch (err) { console.error('Anti-spam error'); }
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
            const logEmbed = new EmbedBuilder().setTitle(`📝 Log: ${title}`).setDescription(`${desc}\n\n**Mod:** ${member.user.tag}\n**Channel:** ${channel}`).setColor(color).setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
    };

    // --- REEMPLAZO DE QUICKEMBED SIN TITULO ---
    const quickEmbed = (desc, color = '#ffffff', logIt = false, logT = "Action") => {
        if (logIt) sendGlobalLog(logT, desc, color);
        return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(desc).setColor(color)] }).catch(() => null);
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
            return quickEmbed(`${ICONS.bankick} Word \`${word}\` blocked (Lvl ${level}).`, '#2ecc71', true, 'Word Blocked');
        }
        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            if (currentWordsMap.delete(word)) {
                forbiddenWords.set(guild.id, currentWordsMap);
                return quickEmbed(`${ICONS.check} Word \`${word}\` removed.`, '#3498db', true, 'Word Removed');
            }
            return quickEmbed(`${ICONS.error} Word not found.`, '#ff0000');
        }
        if (commandName === 'badwords-list') {
            const list = Array.from(currentWordsMap.entries()).map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'None.';
            return quickEmbed(`${ICONS.check} **Blocked:**\n${list}`, '#f1c40f');
        }
    }

    if (commandName.startsWith('link-whitelist') || commandName === 'setup-antilinks' || commandName === 'setup-antiflood') {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (commandName !== 'link-whitelist-list' && !hasAuth) return quickEmbed(`${ICONS.error} Manage Server required.`, '#ff0000');
        if (commandName === 'setup-antiflood') {
            const isE = options.getBoolean('enabled');
            const maxD = options.getInteger('max_duplicates');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), flood_enabled: isE, flood_max: maxD });
            return quickEmbed(`${ICONS.check} Anti-Flood: ${isE ? 'ON' : 'OFF'} (Limit: ${maxD})`, isE ? '#2ecc71' : '#e74c3c', true, 'Anti-Flood Config');
        }
        if (commandName === 'setup-antilinks') {
            const isE = options.getBoolean('enabled');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), antilinks_enabled: isE });
            return quickEmbed(isE ? `${ICONS.check} Anti-Links: ON` : `${ICONS.check} Anti-Links: OFF`, isE ? '#2ecc71' : '#e74c3c', true, 'Anti-Link Config');
        }
        let currentWhitelist = linkWhitelist.get(guild.id) || new Set();
        if (commandName === 'link-whitelist-add') {
            const dom = options.getString('domain').toLowerCase().replace('www.', '').split('/')[0];
            currentWhitelist.add(dom); linkWhitelist.set(guild.id, currentWhitelist);
            return quickEmbed(`${ICONS.check} Domain \`${dom}\` allowed.`, '#2ecc71', true, 'Whitelist Add');
        }
        if (commandName === 'link-whitelist-remove') {
            const dom = options.getString('domain').toLowerCase();
            if (currentWhitelist.delete(dom)) {
                linkWhitelist.set(guild.id, currentWhitelist);
                return quickEmbed(`${ICONS.check} Domain \`${dom}\` removed.`, '#e74c3c', true, 'Whitelist Remove');
            }
            return quickEmbed(`${ICONS.error} Not found.`, '#ff0000');
        }
        if (commandName === 'link-whitelist-list') {
            const list = Array.from(currentWhitelist).map(d => `• \`${d}\``).join('\n') || 'Empty.';
            return quickEmbed(`${ICONS.check} **Whitelisted Domains:**\n${list}`, '#3498db');
        }
    }

    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Developer Only.`, '#ff0000');
        try {
            const code = options.getString('code');
            let evalued = await eval(code);
            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });
            if (evalued.includes(TOKEN)) evalued = "SENSITIVE DATA HIDDEN";
            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`📥 **Input:**\n\`\`\`js\n${code}\n\`\`\`\n📤 **Output:**\n\`\`\`js\n${evalued.substring(0, 800)}\n\`\`\``).setColor('#2ecc71')] });
        } catch (e) { return quickEmbed(`${ICONS.error} Error: \`${e.message}\``, '#e74c3c'); }
    }

    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed(`${ICONS.error} Developer Only.`, '#ff0000');
        const action = options.getString('action');
        const target = options.getUser('user');
        if (action === 'add') {
            blacklistedUsers.add(target.id);
            return quickEmbed(`${ICONS.bankick} User **${target.tag}** blacklisted.`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed(`${ICONS.check} Blacklist removed: **${target.tag}**.`, '#2ecc71');
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
    if (!['audit', 'flip', 'color', 'embed', 'badwords-list', 'link-whitelist-list'].includes(commandName) && !hasAuthMod) return quickEmbed(`${ICONS.error} Unauthorized.`, '#ff0000');

    try {
        switch (commandName) {
            case 'slowmode':
                const sec = options.getInteger('seconds');
                await channel.setRateLimitPerUser(sec, options.getString('reason') || 'N/A');
                return quickEmbed(`${ICONS.timeout} Slowmode set to **${sec}s**.`, '#3498db', true, 'Slowmode');

            case 'purge':
                const pAm = options.getInteger('amount');
                const pUs = options.getUser('user');
                const pFe = await channel.messages.fetch({ limit: pAm });
                const pDel = await channel.bulkDelete(pUs ? pFe.filter(m => m.author.id === pUs.id) : pFe, true);
                return quickEmbed(`${ICONS.check} Purged **${pDel.size}** messages.`, '#95a5a6', true, 'Purge');

            case 'purge-after':
                const pAf = await channel.messages.fetch({ after: options.getString('message_id'), limit: 100 });
                const pADel = await channel.bulkDelete(pAf, true);
                return quickEmbed(`${ICONS.check} Purged **${pADel.size}** messages.`, '#95a5a6', true, 'Purge After');

            case 'setup-antispam':
                localConfig.set(guild.id, { ...localConfig.get(guild.id), spam_limit: options.getInteger('limit'), spam_seconds: options.getInteger('seconds'), immune_role_id: options.getRole('immune_role')?.id });
                return quickEmbed(`${ICONS.check} Anti-Spam updated.`, '#2ecc71', true, 'Spam Config');

            case 'create-role':
                const rN = await guild.roles.create({ name: options.getString('name'), color: options.getString('color') || '#95a5a6' });
                return quickEmbed(`${ICONS.check} Role ${rN} created.`, rN.hexColor, true, 'Role Create');

            case 'set-admin-role':
                localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: options.getRole('role').id });
                return quickEmbed(`${ICONS.check} Admin role: **${options.getRole('role').name}**.`, '#2ecc71');

            case 'set-logs':
                localConfig.set(guild.id, { ...localConfig.get(guild.id), log_channel: options.getChannel('channel').id });
                return quickEmbed(`${ICONS.check} Logs set to ${options.getChannel('channel')}.`, '#3498db');

            case 'ban':
                const bU = options.getUser('user');
                const bM = await guild.members.fetch(bU.id).catch(() => null);
                if (!isOwner && bM && bM.roles.highest.position >= member.roles.highest.position) return quickEmbed(`${ICONS.error} Hierarchy Error.`, '#ff0000');
                await guild.members.ban(bU, { reason: options.getString('reason') });
                return quickEmbed(`${ICONS.bankick} **${bU.tag}** banned.`, '#ff0000', true, 'Ban');

            case 'unban':
                await guild.members.unban(options.getString('user_id'));
                return quickEmbed(`${ICONS.check} ID \`${options.getString('user_id')}\` unbanned.`, '#2ecc71', true, 'Unban');

            case 'kick':
                const kM = options.getMember('user');
                if (!isOwner && kM && kM.roles.highest.position >= member.roles.highest.position) return quickEmbed(`${ICONS.error} Hierarchy Error.`, '#ff0000');
                await kM.kick();
                return quickEmbed(`${ICONS.bankick} **${kM.user.tag}** kicked.`, '#e67e22', true, 'Kick');

            case 'warn':
                const wU = options.getUser('user');
                const wM = await guild.members.fetch(wU.id).catch(() => null);
                if (!isOwner && wM && wM.roles.highest.position >= member.roles.highest.position) return quickEmbed(`${ICONS.error} Hierarchy Error.`, '#ff0000');
                const wns = localWarns.get(wU.id) || []; wns.push({ date: new Date().toLocaleDateString(), reason: options.getString('reason') });
                localWarns.set(wU.id, wns);
                return quickEmbed(`${ICONS.warn} **${wU.tag}** warned. (Warns: ${wns.length})`, '#f1c40f', true, 'Warning');

            case 'infractions':
                const iH = localWarns.get(options.getUser('user').id) || [];
                const iL = iH.map((w, i) => `**${i+1}.** ${w.reason}`).join('\n') || 'None.';
                return quickEmbed(`${ICONS.check} **Warns for ${options.getUser('user').username}:**\n${iL}`, '#3498db');

            case 'timeout':
                const tM = options.getMember('user');
                if (!isOwner && tM && tM.roles.highest.position >= member.roles.highest.position) return quickEmbed(`${ICONS.error} Hierarchy Error.`, '#ff0000');
                await tM.timeout(options.getInteger('minutes') * 60000, options.getString('reason'));
                return quickEmbed(`${ICONS.timeout} **${tM.user.tag}** muted ${options.getInteger('minutes')}m.`, '#e67e22', true, 'Mute');

            case 'unmute':
                const umM = options.getMember('user');
                if (!isOwner && umM && umM.roles.highest.position >= member.roles.highest.position) return quickEmbed(`${ICONS.error} Hierarchy Error.`, '#ff0000');
                await umM.timeout(null); return quickEmbed(`${ICONS.check} **${umM.user.tag}** unmuted.`, '#2ecc71', true, 'Unmute');

            case 'lock':
            case 'unlock':
                const isLk = commandName === 'lock';
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isLk });
                return quickEmbed(isLk ? `🔐 Channel Locked.` : `🔓 Channel Unlocked.`, isLk ? '#ff0000' : '#2ecc71', true, 'Lockdown');

            case 'audit':
                const aTr = options.getMember('user');
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`${ICONS.check} **Audit: ${aTr.user.tag}**\n🆔 ID: \`${aTr.user.id}\`\n🛡️ Admin: ${aTr.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No'}`).setColor('#3498db')] });

            case 'role-give':
            case 'role-take':
                const rgM = options.getMember('user'); const rgR = options.getRole('role');
                if (!isOwner && (rgM.roles.highest.position >= member.roles.highest.position || rgR.position >= member.roles.highest.position)) return quickEmbed(`${ICONS.error} Hierarchy Error.`, '#ff0000');
                commandName === 'role-give' ? await rgM.roles.add(rgR) : await rgM.roles.remove(rgR);
                return quickEmbed(`${ICONS.check} Role **${rgR.name}** updated.`, '#3498db', true, 'Role Edit');

            case 'create-channel':
                const nCh = await guild.channels.create({ name: options.getString('name'), type: options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice });
                return quickEmbed(`${ICONS.check} Channel ${nCh} created.`, '#2ecc71', true, 'Channel Create');

            case 'color':
                const cI = options.getString('input'); return quickEmbed(`${ICONS.check} Color: **${cI}**.`, cI.startsWith('#') ? cI : '#ffffff');

            case 'echo':
                await channel.send(options.getString('text')); return interaction.editReply({ content: 'Done.' });

            case 'flip':
                return quickEmbed(`🪙 Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');

            case 'embed':
                const eDesc = options.getString('description');
                const eEmbed = new EmbedBuilder().setDescription(eDesc).setColor(options.getString('color') || '#ffffff');
                if (options.getString('title')) eEmbed.setTitle(options.getString('title'));
                return interaction.editReply({ embeds: [eEmbed] });

            default: return quickEmbed(`${ICONS.error} Not found.`, '#ff0000');
        }
    } catch (err) { return quickEmbed(`${ICONS.error} Error: \`${err.message}\``, '#ff0000'); }
});

process.on('unhandledRejection', r => null);
process.on('uncaughtException', e => null);
client.login(TOKEN);
