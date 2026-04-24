const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType 
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] 
});

const APP_ID = "1495239262579195986"; 

// --- REGISTRO DE COMANDOS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v3.1 | Advanced Security Suite Online`);
    
    const commands = [
        { name: 'set-admin-role', description: 'Setup the authorized admin role', default_member_permissions: PermissionFlagsBits.Administrator.toString(), options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'audit', description: 'Deep security analysis of a user', options: [{ name: 'user', type: 6, description: 'Target user', required: true }] },
        { name: 'investigate', description: 'Isolate a user in a private channel', options: [{ name: 'user', type: 6, description: 'Target user', required: true }] },
        { name: 'release', description: 'Close an investigation and delete the private channel' },
        { name: 'server-stats', description: 'Tactical overview of the server' },
        { name: 'role-give', description: 'Assign a role', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove a role', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'ban', description: 'Ban a user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'purge', description: 'Clear messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'lock', description: 'Lock channel' },
        { name: 'unlock', description: 'Unlock channel' },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Content', required: true }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- MANEJADOR DE INTERACCIONES ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    // Diferir para evitar timeouts
    const isEphemeral = !['audit', 'server-stats'].includes(commandName);
    await interaction.deferReply({ ephemeral: isEphemeral });

    const quickEmbed = (title, description, color = '#ffffff') => {
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    };

    // FILTRO DE SEGURIDAD GLOBAL
    if (!['audit', 'server-stats', 'set-admin-role'].includes(commandName)) {
        const { data: config } = await supabase.from('guild_settings').select('admin_role_id').eq('guild_id', guild.id).single();
        const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('❌ Access Denied', 'Insufficient security clearance.', '#ff0000');
    }

    // INVESTIGATE & RELEASE
    if (commandName === 'investigate') {
        const target = options.getMember('user');
        try {
            const privateChannel = await guild.channels.create({
                name: `investigation-${target.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: target.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });
            return quickEmbed('⚖️ Investigation Started', `Private channel created: ${privateChannel}`, '#e67e22');
        } catch (e) { return quickEmbed('❌ Error', 'Could not create channel.', '#ff0000'); }
    }

    if (commandName === 'release') {
        if (!channel.name.startsWith('investigation-')) return quickEmbed('❌ Error', 'This is not an investigation channel.', '#ff0000');
        await quickEmbed('✅ Investigation Concluded', 'This channel will be deleted in 5 seconds...', '#2ecc71');
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
    }

    // SERVER STATS (Sugerencia)
    if (commandName === 'server-stats') {
        const statsEmbed = new EmbedBuilder()
            .setTitle(`📊 Tactical Report: ${guild.name}`)
            .setColor('#3498db')
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                { name: '🤖 Bots', value: `${guild.members.cache.filter(m => m.user.bot).size}`, inline: true },
                { name: '💎 Boost Level', value: `${guild.premiumTier}`, inline: true },
                { name: '📂 Channels', value: `${guild.channels.cache.size}`, inline: true },
                { name: '🛡️ Security Level', value: `${guild.verificationLevel}`, inline: true }
            );
        return interaction.editReply({ embeds: [statsEmbed] });
    }

    // AUDIT
    if (commandName === 'audit') {
        const target = options.getMember('user');
        const accountAgeDays = Math.floor((Date.now() - target.user.createdTimestamp) / (1000 * 60 * 60 * 24));
        const auditEmbed = new EmbedBuilder()
            .setAuthor({ name: `Audit: ${target.user.tag}`, iconURL: target.user.displayAvatarURL() })
            .setColor(accountAgeDays >= 30 ? '#2ecc71' : '#ff0000')
            .addFields(
                { name: '🆔 ID', value: `\`${target.user.id}\``, inline: true },
                { name: '🎭 Roles', value: `${target.roles.cache.size - 1}`, inline: true },
                { name: '⚖️ Status', value: accountAgeDays >= 30 ? '✅ SAFE' : '⚠️ WARNING' },
                { name: '⏳ Age', value: `${accountAgeDays} days`, inline: true }
            );
        return interaction.editReply({ embeds: [auditEmbed] });
    }

    // MODERACIÓN GENERAL
    if (commandName === 'role-give' || commandName === 'role-take') {
        const target = options.getMember('user');
        const role = options.getRole('role');
        commandName === 'role-give' ? await target.roles.add(role) : await target.roles.remove(role);
        return quickEmbed('🎭 Role Updated', `Target: ${target.user.tag}`, '#9b59b6');
    }

    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        await channel.bulkDelete(amount, true);
        return quickEmbed('🧹 Purge', `Cleared ${amount} messages.`, '#95a5a6');
    }

    if (commandName === 'lock' || commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: commandName === 'unlock' });
        return quickEmbed('🔒 Status', 'Channel access updated.', '#e67e22');
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.editReply({ content: 'Message delivered.' });
    }

    if (commandName === 'set-admin-role') {
        const role = options.getRole('role');
        await supabase.from('guild_settings').upsert({ guild_id: guild.id, admin_role_id: role.id });
        return quickEmbed('✅ Security Updated', `Admin role set to: **${role.name}**`, '#2ecc71');
    }
});

client.login(process.env.DISCORD_TOKEN);
