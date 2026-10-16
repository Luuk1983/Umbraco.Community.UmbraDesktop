using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// The Arcade's tables, registered with Umbraco through <c>AddUmbracoDbContext</c> (design D9).
/// </summary>
/// <remarks>
/// Two constructors, so not a primary constructor: the public one is what Umbraco's pooled factory
/// calls, and the protected one lets <see cref="SqlServerArcadeDbContext"/> and
/// <see cref="SqliteArcadeDbContext"/> pass their own options type, which is how EF keeps one
/// migration set per provider in one assembly.
/// </remarks>
public class ArcadeDbContext : DbContext
{
    /// <summary>Creates the runtime context.</summary>
    /// <param name="options">Umbraco's options, already pointed at the site's database.</param>
    public ArcadeDbContext(DbContextOptions<ArcadeDbContext> options) : base(options) { }

    /// <summary>Creates a provider-specific migration context.</summary>
    /// <param name="options">That context's options.</param>
    protected ArcadeDbContext(DbContextOptions options) : base(options) { }

    /// <summary>
    /// The Arcade's own migrations history table. EF's default, <c>__EFMigrationsHistory</c>, would be
    /// shared with any other EF context on the site, and dropping the Arcade's tables after an
    /// uninstall must not mean touching anyone else's history. Set by every place that builds a
    /// migrating context: the design-time factories, <c>ArcadeMigrator</c> and the tests.
    /// </summary>
    public const string MigrationsHistoryTable = "umbraDesktopArcadeMigrations";

    /// <summary>Players' settings.</summary>
    public DbSet<ArcadeProfileEntity> Profiles => Set<ArcadeProfileEntity>();

    /// <summary>Board rules.</summary>
    public DbSet<ArcadeLeaderboardEntity> Leaderboards => Set<ArcadeLeaderboardEntity>();

    /// <summary>Best scores.</summary>
    public DbSet<ArcadeScoreEntity> Scores => Set<ArcadeScoreEntity>();

    /// <summary>Unread beaten events.</summary>
    public DbSet<ArcadeBeatenEntity> Beaten => Set<ArcadeBeatenEntity>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ArcadeProfileEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeProfile");
            entity.HasKey(x => x.UserKey);
            entity.Property(x => x.DisplayName).HasMaxLength(ScoreRules.MaxDisplayNameLength).IsRequired();
        });
        modelBuilder.Entity<ArcadeLeaderboardEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeLeaderboard");
            entity.HasKey(x => new { x.Game, x.Board });
            entity.Property(x => x.Game).HasMaxLength(ScoreRules.MaxGameAliasLength);
            entity.Property(x => x.Board).HasMaxLength(ScoreRules.MaxBoardAliasLength);
            entity.Property(x => x.Better).HasMaxLength(10).IsRequired();
            entity.Property(x => x.Format).HasMaxLength(10).IsRequired();
        });
        modelBuilder.Entity<ArcadeScoreEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeScore");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Game).HasMaxLength(ScoreRules.MaxGameAliasLength).IsRequired();
            entity.Property(x => x.Board).HasMaxLength(ScoreRules.MaxBoardAliasLength).IsRequired();
            entity.HasIndex(x => new { x.UserKey, x.Game, x.Board }).IsUnique();
            entity.HasIndex(x => new { x.Game, x.Board });
        });
        modelBuilder.Entity<ArcadeBeatenEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeBeaten");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Game).HasMaxLength(ScoreRules.MaxGameAliasLength).IsRequired();
            entity.Property(x => x.Board).HasMaxLength(ScoreRules.MaxBoardAliasLength).IsRequired();
            entity.HasIndex(x => new { x.UserKey, x.Game, x.Board }).IsUnique();
            entity.HasIndex(x => x.ByUserKey);
            entity.HasIndex(x => x.AtUtc);
        });
    }
}
