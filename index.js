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
const TOKEN = process.env.DISCORD_TOKEN;

// --- STORAGE LOCAL ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 

// --- REGISTRO DE COMANDOS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v3.8 [STABLE-EN] | Online`);
    
    const commands = [
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'set-logs', description: 'Setup logs channel', options: [{ name: 'channel', type: 7, description: 'Channel', required: true }] },
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
            description: 'Crea un rol con permisos predefinidos', 
            options: [
                { name: 'name', type: 3, description: 'Nombre del rol', required: true },
                { name: 'color', type: 3, description: 'Color Hex (ej: #ff0000)', required: false },
                { 
                    name: 'level', 
                    type: 3, 
                    description: 'Nivel de permisos', 
                    required: false,
                    choices: [
                        { name: 'Miembro', value: 'miembro' },
                        { name: 'Moderador', value: 'moderador' },
                        { name: 'Administrador', value: 'administrador' }
                    ]
                }
            ] 
        },
        { name: 'create-channel', description: 'Create a channel', options: [
            { name: 'name', type: 3, description: 'Channel name', required: true },
            { name: 'type', type: 3, description: 'Text or Voice', required: true, choices: [{ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }] }
        ]},
        { name: 'purge', description: 'Clear messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'lock', description: 'Lock channel (Hard Lock)' },
        { name: 'unlock', description: 'Unlock channel' },
        { name: 'investigate', description: 'Private isolation', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'release', description: 'End investigation' },
        { name: 'color', description: 'Color info', options: [{ name: 'input', type: 3, description: 'Hex or Name', required: true }] },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Text', required: true }] },
        { name: 'flip', description: 'Coin flip' },
        { 
            name: 'embed', 
            description: 'Generate a custom embed', 
            options: [
                { name: 'description', type: 3, description: 'Main content', required: true },
                { name: 'title', type: 3, description: 'Embed title', required: false },
                { name: 'color', type: 3, description: 'Hex color (e.g. #ff0000)', required: false },
                { name: 'thumbnail', type: 3, description: 'Thumbnail URL', required: false },
                { name: 'image', type: 3, description: 'Large image URL', required: false }
            ] 
        }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- ANTI-SPAM ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    const now = Date.now();
    const config = localConfig.get(message.guild.id);
    if (message.member?.permissions.has(PermissionFlagsBits.Administrator) || (config && message.member?.roles.cache.has(config.admin_role_id))) return;

    if (!spamMap.has(message.author.id)) {
        spamMap.set(message.author.id, { count: 1, lastMessage: now });
        return;
    }

    const userData = spamMap.get(message.author.id);
    if (now - userData.lastMessage < 5000) { userData.count++; } else { userData.count = 1; }
    userData.lastMessage = now;

    if (userData.count >= 5) {
        userData.count = 0;
        try {
            const msgs = await message.channel.messages.fetch({ limit: 10 });
            await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
            await message.member.timeout(600000, 'Anti-Spam Triggered');
            message.channel.send(`🛡️ **Warden:** ${message.author} muted for spam.`);
        } catch (err) { console.error('Anti-spam error ignored.'); }
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const sendGlobalLog = (title, desc, color) => {
        const conf = localConfig.get(guild.id);
        if (!conf || !conf.log_channel) return;
        const logChannel = guild.channels.cache.get(conf.log_channel);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(`📝 Log: ${title}`)
                .setDescription(`${desc}\n\n**Moderator:** ${member.user.tag}\n**Channel:** ${channel}`)
                .setColor(color)
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
    };

    const quickEmbed = (title, desc, color = '#ffffff', logIt = false) => {
        if (logIt) sendGlobalLog(title, desc, color);
        return interaction.editReply({ 
            embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] 
        }).catch(() => null);
    };

    const config = localConfig.get(guild.id);
    const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
    
    if (!['audit', 'flip', 'color', 'embed'].includes(commandName) && !hasAuth) {
        return quickEmbed('❌ Access Denied', 'Unauthorized. You lack permissions or Admin Role is not set.', '#ff0000');
    }

    try {
        switch (commandName) {
            case 'create-role':
                const rName = options.getString('name');
                const rColor = options.getString('color') || '#95a5a6';
                const rLevel = options.getString('level');
                let perms = [];
                let hoist = false;

                if (rLevel === 'miembro') {
                    perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions];
                } else if (rLevel === 'moderador') {
                    perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageRoles];
                    hoist = true;
                } else if (rLevel === 'administrador') {
                    perms = [PermissionFlagsBits.Administrator];
                    hoist = true;
                } else {
                    perms = [PermissionFlagsBits.ViewChannel];
                }

                const newRole = await guild.roles.create({
                    name: rName,
                    color: rColor.startsWith('#') ? rColor : '#95a5a6',
                    permissions: perms,
                    hoist: hoist,
                    reason: `Warden System: Rol creado por ${member.user.tag}`
                });

                return quickEmbed('🎨 Rol Creado', `**Nombre:** ${newRole}\n**Nivel:** ${rLevel || 'Decoración'}\n**Color:** ${rColor}`, newRole.hexColor, true);

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
                const bReason = options.getString('reason') || 'No reason provided';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed('🔨 Ban Applied', `**Target:** ${bUser.tag}\n**Reason:** ${bReason}`, '#ff0000', true);

            case 'unban':
                const uId = options.getString('user_id');
                await guild.members.unban(uId);
                return quickEmbed('🔓 Unbanned', `User ID \`${uId}\` has been unbanned.`, '#2ecc71', true);

            case 'kick':
                const kMember = options.getMember('user');
                if (!kMember || !kMember.kickable) throw new Error('Cannot kick this user (Hierarchy/Null).');
                const kReason = options.getString('reason') || 'No reason provided';
                await kMember.kick(kReason);
                return quickEmbed('🚀 Kicked', `User **${kMember.user.tag}** has been removed.\n**Reason:** ${kReason}`, '#e67e22', true);

            case 'warn':
                const wUser = options.getUser('user');
                const wReason = options.getString('reason');
                const warns = localWarns.get(wUser.id) || [];
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
                if (!tMember || !tMember.manageable) throw new Error('Hierarchy restriction or member not found.');
                const tMin = options.getInteger('minutes');
                const tReason = options.getString('reason') || 'No reason';
                await tMember.timeout(tMin * 60000, tReason);
                return quickEmbed('⏳ Timeout', `${tMember.user.tag} muted for ${tMin}m.\n**Reason:** ${tReason}`, '#e67e22', true);

            case 'unmute':
                const umMember = options.getMember('user');
                if (!umMember) throw new Error('Member not found.');
                await umMember.timeout(null);
                return quickEmbed('🔊 Unmuted', `${umMember.user.tag} is no longer muted.`, '#2ecc71', true);

            case 'purge':
                const pAmount = Math.min(options.getInteger('amount'), 100);
                const deleted = await channel.bulkDelete(pAmount, true);
                return quickEmbed('🧹 Purge', `Successfully deleted **${deleted.size}** messages.`, '#95a5a6', true);

            case 'lock':
            case 'unlock':
                const isLock = commandName === 'lock';
                const lockPerms = { 
                    SendMessages: !isLock,
                    SendMessagesInThreads: !isLock,
                    CreatePublicThreads: !isLock,
                    CreatePrivateThreads: !isLock,
                    AddReactions: !isLock,
                    AttachFiles: !isLock,
                    EmbedLinks: !isLock,
                    UseExternalEmojis: !isLock
                };
                await channel.permissionOverwrites.edit(guild.roles.everyone, lockPerms);
                return quickEmbed(isLock ? '🔐 Hard Lock' : '🔓 Unlocked', isLock ? 'Channel fully locked for @everyone.' : 'Access restored.', isLock ? '#ff0000' : '#2ecc71', true);

            case 'audit':
                const aTarget = options.getMember('user');
                if (!aTarget) throw new Error('Target not found.');

                const accountAge = Math.floor((Date.now() - aTarget.user.createdTimestamp) / 86400000);
                const joinServer = Math.floor((Date.now() - aTarget.joinedTimestamp) / 86400000);
                const isAdmin = aTarget.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No';
                const isSafe = accountAge >= 30;

                const auditEmbed = new EmbedBuilder()
                    .setAuthor({ name: `Audit Report: ${aTarget.user.username}`, iconURL: aTarget.user.displayAvatarURL() })
                    .setThumbnail(aTarget.user.displayAvatarURL())
                    .setColor(isSafe ? '#2ecc71' : '#ff0000')
                    .addFields(
                        { name: '🆔 User ID', value: `\`${aTarget.user.id}\``, inline: false },
                        { name: '👤 Username', value: aTarget.user.username, inline: true },
                        { name: '📛 Original Name', value: aTarget.user.globalName || 'None', inline: true },
                        { name: '🔝 Highest Role', value: `${aTarget.roles.highest}`, inline: false },
                        { name: '🛡️ Admin Perms', value: isAdmin, inline: true },
                        { name: '🎭 Role Count', value: `${aTarget.roles.cache.size - 1}`, inline: true },
                        { name: '📅 Joined Discord', value: `about ${accountAge} days ago`, inline: false },
                        { name: '📥 Joined Server', value: `about ${joinServer} days ago`, inline: false },
                        { name: '⚖️ Security Status', value: isSafe ? '✅ **SAFE** (Account Age > 30d)' : '⚠️ **WARNING** (New Account)', inline: false }
                    )
                    .setFooter({ text: `Account Age: ${accountAge} days` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [auditEmbed] });

            case 'role-give':
            case 'role-take':
                const rgMember = options.getMember('user');
                const rgRole = options.getRole('role');
                if (!rgMember || !rgRole) throw new Error('Invalid target or role.');
                commandName === 'role-give' ? await rgMember.roles.add(rgRole) : await rgMember.roles.remove(rgRole);
                return quickEmbed('🎭 Role Updated', `Updated **${rgRole.name}** for **${rgMember.user.tag}**`, '#3498db', true);

            case 'create-channel':
                const cnName = options.getString('name');
                const cnType = options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
                const newChan = await guild.channels.create({ name: cnName, type: cnType });
                return quickEmbed('✨ Channel Created', `New channel: ${newChan}`, '#2ecc71', true);

            case 'investigate':
                const invTarget = options.getMember('user');
                if (!invTarget) throw new Error('Target not found.');
                await channel.permissionOverwrites.edit(invTarget, { ViewChannel: true, SendMessages: true });
                return quickEmbed('🕵️ Investigation', `${invTarget} has been isolated for questioning.`, '#9b59b6', true);

            case 'release':
                await channel.permissionOverwrites.delete(member); 
                return quickEmbed('🕊️ Released', `Investigation concluded.`, '#2ecc71', true);

            case 'color':
                const colorHex = options.getString('input');
                return quickEmbed('🎨 Color Info', `Previewing color: **${colorHex}**`, colorHex.startsWith('#') ? colorHex : '#ffffff');

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Message sent.' });

            case 'flip':
                return quickEmbed('🪙 Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');

            case 'embed':
                const eDesc = options.getString('description');
                const customEmbed = new EmbedBuilder()
                    .setDescription(eDesc)
                    .setColor(options.getString('color')?.startsWith('#') ? options.getString('color') : '#ffffff')
                    .setTimestamp();
                if (options.getString('title')) customEmbed.setTitle(options.getString('title'));
                if (options.getString('thumbnail')) customEmbed.setThumbnail(options.getString('thumbnail'));
                if (options.getString('image')) customEmbed.setImage(options.getString('image'));
                return interaction.editReply({ embeds: [customEmbed] });

            default:
                return quickEmbed('❓ Unknown', 'Command logic not found.', '#7289da');
        }
    } catch (err) {
        console.error(err);
        return quickEmbed('❌ Error', `Action failed: \`${err.message}\``, '#ff0000');
    }
});

// --- ANTI-CRASH SYSTEM ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('🛡️ Global Error (Rejection):', reason);
});

process.on('uncaughtException', (err, origin) => {
    console.error('🛡️ Global Error (Exception):', err);
});

client.login(TOKEN);
