const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes 
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; 

// --- 1. REGISTRATION ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v2.3 | Audit & Security Core Online`);
    
    const commands = [
        { name: 'set-admin-role', description: 'Setup the authorized admin role', default_member_permissions: PermissionFlagsBits.Administrator.toString(), options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'audit', description: 'Deep security analysis of a user', options: [{ name: 'user', type: 6, description: 'Target user', required: true }] },
        { name: 'ban', description: 'Ban a user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban a user ID', options: [{ name: 'user_id', type: 3, description: 'User ID', required: true }] },
        { name: 'kick', description: 'Kick a user', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'timeout', description: 'Mute user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Minutes', required: true }] },
        { name: 'warn', description: 'Cloud-synced warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View user history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'purge', description: 'Clear messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'lock', description: 'Lock channel' },
        { name: 'unlock', description: 'Unlock channel' },
        { name: 'add-rank', description: 'Create rank', options: [{ name: 'name', type: 3, description: 'Name', required: true }] },
        { name: 'color', description: 'Hex info', options: [{ name: 'hex', type: 3, description: 'Hex code', required: true }] },
        { name: 'flip', description: 'Coin flip' },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Content', required: true }] },
        { name: 'embed', description: 'Professional announcement', options: [{ name: 'description', type: 3, description: 'Content', required: true }, { name: 'title', type: 3, description: 'Title' }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- 2. INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    // Standard Defer
    await interaction.deferReply({ ephemeral: !['audit', 'flip', 'color'].includes(commandName) });

    const quickEmbed = (title, description, color = '#ffffff') => {
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    };

    // --- SECURITY CHECK ---
    if (!['audit', 'flip', 'color', 'set-admin-role', 'echo'].includes(commandName)) {
        const { data: config } = await supabase.from('guild_settings').select('admin_role_id').eq('guild_id', guild.id).single();
        const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('❌ Access Denied', 'You need the authorized Admin Role.', '#ff0000');
    }

    // --- COMMAND: AUDIT ---
    if (commandName === 'audit') {
        const target = options.getMember('user');
        const user = target.user;

        const joinedDiscord = Math.floor(user.createdTimestamp / 1000);
        const joinedServer = Math.floor(target.joinedTimestamp / 1000);
        const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
        
        const isSafe = accountAgeDays >= 30;
        const statusHeader = isSafe ? '✅ **SAFE** (Account Age > 30d)' : '⚠️ **WARNING** (New Account < 30d)';
        const embedColor = isSafe ? '#2ecc71' : '#e67e22';

        const auditEmbed = new EmbedBuilder()
            .setAuthor({ name: `Audit Report: ${user.tag}`, iconURL: user.displayAvatarURL() })
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
            .setColor(embedColor)
            .addFields(
                { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
                { name: '👤 Username', value: user.username, inline: true },
                { name: '📛 Original Name', value: user.globalName || 'Not set', inline: true },
                { name: '🔝 Highest Role', value: `${target.roles.highest}`, inline: true },
                { name: '🛡️ Admin Perms', value: target.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No', inline: true },
                { name: '🎭 Role Count', value: `${target.roles.cache.size - 1}`, inline: true },
                { name: '📅 Joined Discord', value: `<t:${joinedDiscord}:R>`, inline: true },
                { name: '📥 Joined Server', value: `<t:${joinedServer}:R>`, inline: true },
                { name: '⚖️ Security Status', value: statusHeader }
            )
            .setFooter({ text: `Account Age: ${accountAgeDays} days` });

        return interaction.editReply({ embeds: [auditEmbed] });
    }

    // --- MODERATION LOGIC ---
    if (['ban', 'kick', 'timeout', 'warn'].includes(commandName)) {
        const target = options.getMember('user');
        const reason = options.getString('reason') || 'No reason provided.';
        if (!target.manageable) return quickEmbed('❌ Error', 'Hierarchy restriction.', '#ff0000');

        if (commandName === 'ban') await target.ban({ reason });
        if (commandName === 'warn') await supabase.from('infractions').insert([{ user_id: target.id, guild_id: guild.id, reason }]);
        
        return quickEmbed(`🛑 ${commandName.toUpperCase()}`, `**Target:** ${target.user.tag}\n**Reason:** ${reason}`, '#ff0000');
    }

    // --- UTILITIES ---
    if (commandName === 'set-admin-role') {
        const role = options.getRole('role');
        await supabase.from('guild_settings').upsert({ guild_id: guild.id, admin_role_id: role.id });
        return quickEmbed('✅ Security Updated', `Admin role linked to: **${role.name}**`, '#2ecc71');
    }

    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        await channel.bulkDelete(amount, true);
        return quickEmbed('🧹 Purge', `Deleted ${amount} messages.`, '#95a5a6');
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.editReply({ content: 'Done.' });
    }

    if (commandName === 'flip') {
        return quickEmbed('🪙 Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');
    }
});

client.login(process.env.DISCORD_TOKEN);
