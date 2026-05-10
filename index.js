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
const OWNER_ID = "1238184110975877130"; // Tu Master Key
const TOKEN = process.env.DISCORD_TOKEN; // Actualizado para Railway

// --- STORAGE LOCAL ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 

// --- REGISTRO DE COMANDOS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v4.5 [MASTER-CONTROL] | Online`);

    const commands = [
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

// --- ANTI-SPAM ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.author.id === OWNER_ID) return; // Bypass total para el dueño

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

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
            message.channel.send(`🛡️ **Warden:** ${message.author} muted for spam.`);
        } catch (err) { console.error('Anti-spam error ignored.'); }
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel, user } = interaction;

    const isOwner = user.id === OWNER_ID;
    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed'].includes(commandName);
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

    if (!['audit', 'flip', 'color', 'embed'].includes(commandName) && !hasAuth) {
        return quickEmbed('❌ Access Denied', 'Unauthorized.', '#ff0000');
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
                // BYPASS DE JERARQUÍA SI ES EL OWNER
                if (!isOwner && bMember && bMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot ban a user with a same or higher role.', '#ff0000');
                }
                const bReason = options.getString('reason') || 'No reason provided';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed('🔨 Ban Applied', `**Target:** ${bUser.tag}\n**Reason:** ${bReason}`, '#ff0000', true);

            case 'unban':
                const uId = options.getString('user_id');
                await guild.members.unban(uId);
                return quickEmbed('🔓 Unbanned', `ID \`${uId}\` unbanned.`, '#2ecc71', true);

            case 'kick':
                const kMember = options.getMember('user');
                if (!kMember || !kMember.kickable) throw new Error('Cannot kick.');
                // BYPASS DE JERARQUÍA SI ES EL OWNER
                if (!isOwner && kMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot kick a user with a same or higher role.', '#ff0000');
                }
                const kReason = options.getString('reason') || 'No reason provided';
                await kMember.kick(kReason);
                return quickEmbed('🚀 Kicked', `User **${kMember.user.tag}** removed.\n**Reason:** ${kReason}`, '#e67e22', true);

            case 'warn':
                const wUser = options.getUser('user');
                const wMember = await guild.members.fetch(wUser.id).catch(() => null);
                // BYPASS DE JERARQUÍA SI ES EL OWNER
                if (!isOwner && wMember && wMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot warn a user with a same or higher role.', '#ff0000');
                }
                const warns = localWarns.get(wUser.id) || [];
                const wReason = options.getString('reason') || 'No reason provided';
                warns.push({ date: new Date().toLocaleDateString(), reason: wReason });
                localWarns.set(wUser.id, warns);
                return quickEmbed('⚠️ Warning Issued', `**Target:** ${wUser}\n**Reason:** ${wReason}\n**Total:** ${warns.length}`, '#f1c40f', true);

            case 'infractions':
                const iUser = options.getUser('user');
                const iHistory = localWarns.get(iUser.id) || [];
                const iList = iHistory.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') || 'No infractions.';
                return quickEmbed(`Infractions: ${iUser.tag}`, iList, '#3498db');

            case 'timeout':
                const tMember = options.getMember('user');
                if (!tMember || !tMember.manageable) throw new Error('Cannot mute.');
                // BYPASS DE JERARQUÍA SI ES EL OWNER
                if (!isOwner && tMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot mute a user with a same or higher role.', '#ff0000');
                }
                const tMin = options.getInteger('minutes');
                const tReason = options.getString('reason') || 'No reason provided';
                await tMember.timeout(tMin * 60000, tReason);
                return quickEmbed('⏳ Timeout', `${tMember.user.tag} muted for ${tMin}m.\n**Reason:** ${tReason}`, '#e67e22', true);

            case 'unmute':
                const umMember = options.getMember('user');
                // BYPASS DE JERARQUÍA SI ES EL OWNER
                if (!isOwner && umMember && umMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('❌ Hierarchy Error', 'You cannot unmute a user with a same or higher role.', '#ff0000');
                }
                await umMember?.timeout(null);
                return quickEmbed('🔊 Unmuted', `${umMember?.user.tag} restored.`, '#2ecc71', true);

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
                if (!aTarget) throw new Error('Not found.');
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
                // BYPASS DE JERARQUÍA SI ES EL OWNER
                if (!isOwner) {
                    if (rgMember.roles.highest.position >= member.roles.highest.position) {
                        return quickEmbed('❌ Hierarchy Error', 'You cannot modify roles of a user with a same or higher role.', '#ff0000');
                    }
                    if (rgRole.position >= member.roles.highest.position) {
                        return quickEmbed('❌ Hierarchy Error', 'You cannot manage a role that is same or higher than yours.', '#ff0000');
                    }
                }
                commandName === 'role-give' ? await rgMember.roles.add(rgRole) : await rgMember.roles.remove(rgRole);
                return quickEmbed('🎭 Role Updated', `User: ${rgMember.user.tag}`, '#3498db', true);

            case 'create-channel':
                const cType = options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
                const newChan = await guild.channels.create({ name: options.getString('name'), type: cType });
                return quickEmbed('✨ Channel Created', `New: ${newChan}`, '#2ecc71', true);

            case 'color':
                const cHex = options.getString('input');
                return quickEmbed('🎨 Color Info', `Color: **${cHex}**`, cHex.startsWith('#') ? cHex : '#ffffff');

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Sent.' });

            case 'flip':
                return quickEmbed('🪙 Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');

            case 'embed':
                const customEmbed = new EmbedBuilder().setDescription(options.getString('description')).setColor(options.getString('color') || '#ffffff');
                if (options.getString('title')) customEmbed.setTitle(options.getString('title'));
                return interaction.editReply({ embeds: [customEmbed] });

            default:
                return quickEmbed('❓ Unknown', 'Not found.', '#7289da');
        }
    } catch (err) {
        console.error(err);
        return quickEmbed('❌ Error', `Failed: \`${err.message}\``, '#ff0000');
    }
});

process.on('unhandledRejection', r => console.error('🛡️ Rejection:', r));
process.on('uncaughtException', e => console.error('🛡️ Exception:', e));

client.login(TOKEN);
