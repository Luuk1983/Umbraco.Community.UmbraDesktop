using Microsoft.EntityFrameworkCore;

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data;

/// <summary>
/// Media Health's tables, registered with Umbraco through <c>AddUmbracoDbContext</c>, the way the
/// Arcade's are (its design D9).
/// </summary>
/// <remarks>
/// Two constructors, so not a primary constructor: the public one is what Umbraco's pooled factory
/// calls, and the protected one lets <see cref="SqlServerMediaHealthDbContext"/> and
/// <see cref="SqliteMediaHealthDbContext"/> pass their own options type, which is how EF keeps one
/// migration set per provider in one assembly.
/// </remarks>
public class MediaHealthDbContext : DbContext
{
    /// <summary>Creates the runtime context.</summary>
    /// <param name="options">Umbraco's options, already pointed at the site's database.</param>
    public MediaHealthDbContext(DbContextOptions<MediaHealthDbContext> options) : base(options) { }

    /// <summary>Creates a provider-specific migration context.</summary>
    /// <param name="options">That context's options.</param>
    protected MediaHealthDbContext(DbContextOptions options) : base(options) { }

    /// <summary>
    /// Media Health's own migrations history table, so dropping its tables after an uninstall never
    /// touches another EF context's history. Set by every place that builds a migrating context.
    /// </summary>
    public const string MigrationsHistoryTable = "umbraDesktopMediaHealthMigrations";

    /// <summary>The checks: the one running and the last one done, with a failed one between.</summary>
    public DbSet<MediaHealthCheckEntity> Checks => Set<MediaHealthCheckEntity>();

    /// <summary>The last check's items.</summary>
    public DbSet<MediaHealthItemEntity> Items => Set<MediaHealthItemEntity>();

    /// <summary>The last check's folders.</summary>
    public DbSet<MediaHealthFolderEntity> Folders => Set<MediaHealthFolderEntity>();

    /// <summary>The last check's orphaned files.</summary>
    public DbSet<MediaHealthOrphanEntity> Orphans => Set<MediaHealthOrphanEntity>();

    /// <summary>The keeps: what someone marked as wanted, across checks (design §16.6).</summary>
    public DbSet<MediaHealthKeepEntity> Keeps => Set<MediaHealthKeepEntity>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MediaHealthCheckEntity>(entity =>
        {
            entity.ToTable("umbraDesktopMediaHealthCheck");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Phase).HasMaxLength(10).IsRequired();
            entity.Property(x => x.Error).HasMaxLength(2000);
        });
        modelBuilder.Entity<MediaHealthItemEntity>(entity =>
        {
            entity.ToTable("umbraDesktopMediaHealthItem");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(255).IsRequired();
            entity.Property(x => x.MediaTypeAlias).HasMaxLength(255).IsRequired();
            entity.Property(x => x.Extension).HasMaxLength(50);
            entity.Property(x => x.Path).HasMaxLength(4000).IsRequired();
            entity.Property(x => x.Url).HasMaxLength(MediaHealthStore.UrlLength);
            entity.HasIndex(x => new { x.CheckId, x.Key });
            entity.HasIndex(x => new { x.CheckId, x.ParentKey });
        });
        modelBuilder.Entity<MediaHealthFolderEntity>(entity =>
        {
            entity.ToTable("umbraDesktopMediaHealthFolder");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(255).IsRequired();
            entity.Property(x => x.Path).HasMaxLength(4000).IsRequired();
            entity.HasIndex(x => new { x.CheckId, x.Key });
        });
        modelBuilder.Entity<MediaHealthOrphanEntity>(entity =>
        {
            entity.ToTable("umbraDesktopMediaHealthOrphan");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.RelativePath).HasMaxLength(MediaHealthStore.UrlLength).IsRequired();
            entity.Property(x => x.Url).HasMaxLength(MediaHealthStore.UrlLength).IsRequired();
            entity.HasIndex(x => x.CheckId);
        });
        modelBuilder.Entity<MediaHealthKeepEntity>(entity =>
        {
            // No index beyond the key: keeps are tens, not thousands, and a 2,000-character target cannot be indexed on SQL Server.
            entity.ToTable("umbraDesktopMediaHealthKeep");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Kind).HasMaxLength(10).IsRequired();
            entity.Property(x => x.Target).HasMaxLength(MediaHealthStore.UrlLength).IsRequired();
            entity.Property(x => x.Fingerprint).HasMaxLength(MediaHealthStore.UrlLength);
            entity.Property(x => x.Note).HasMaxLength(Keep.MediaKeepStore.NoteLength);
            entity.Property(x => x.KeptByName).HasMaxLength(255).IsRequired();
        });
    }
}

/// <summary>
/// The SQL Server migration context. Exists only to own <c>Migrations/SqlServer</c>; the runtime
/// reads and writes through <see cref="MediaHealthDbContext"/>.
/// </summary>
/// <param name="options">Options pointed at a SQL Server database.</param>
public sealed class SqlServerMediaHealthDbContext(DbContextOptions<SqlServerMediaHealthDbContext> options) : MediaHealthDbContext(options);

/// <summary>The SQLite migration context; see <see cref="SqlServerMediaHealthDbContext"/>.</summary>
/// <param name="options">Options pointed at a SQLite database.</param>
public sealed class SqliteMediaHealthDbContext(DbContextOptions<SqliteMediaHealthDbContext> options) : MediaHealthDbContext(options);
