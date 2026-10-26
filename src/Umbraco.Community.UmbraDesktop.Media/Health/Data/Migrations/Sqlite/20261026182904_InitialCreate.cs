using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthCheck",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    StartedUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    TouchedUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    FinishedUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Phase = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Scanned = table.Column<int>(type: "INTEGER", nullable: false),
                    Total = table.Column<int>(type: "INTEGER", nullable: false),
                    Error = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    StartedBy = table.Column<Guid>(type: "TEXT", nullable: true),
                    Items = table.Column<int>(type: "INTEGER", nullable: false),
                    Folders = table.Column<int>(type: "INTEGER", nullable: false),
                    Orphans = table.Column<int>(type: "INTEGER", nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    OrphanBytes = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthCheck", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthFolder",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CheckId = table.Column<int>(type: "INTEGER", nullable: false),
                    Key = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    ParentKey = table.Column<Guid>(type: "TEXT", nullable: true),
                    Path = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthFolder", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthItem",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CheckId = table.Column<int>(type: "INTEGER", nullable: false),
                    Key = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    MediaTypeAlias = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Extension = table.Column<string>(type: "TEXT", maxLength: 50, nullable: true),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: true),
                    ParentKey = table.Column<Guid>(type: "TEXT", nullable: true),
                    Path = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false),
                    UsageCount = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthItem", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthOrphan",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CheckId = table.Column<int>(type: "INTEGER", nullable: false),
                    RelativePath = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    Url = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    LastModifiedUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthOrphan", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopMediaHealthFolder_CheckId_Key",
                table: "umbraDesktopMediaHealthFolder",
                columns: new[] { "CheckId", "Key" });

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopMediaHealthItem_CheckId_Key",
                table: "umbraDesktopMediaHealthItem",
                columns: new[] { "CheckId", "Key" });

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopMediaHealthItem_CheckId_ParentKey",
                table: "umbraDesktopMediaHealthItem",
                columns: new[] { "CheckId", "ParentKey" });

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopMediaHealthOrphan_CheckId",
                table: "umbraDesktopMediaHealthOrphan",
                column: "CheckId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "umbraDesktopMediaHealthCheck");

            migrationBuilder.DropTable(
                name: "umbraDesktopMediaHealthFolder");

            migrationBuilder.DropTable(
                name: "umbraDesktopMediaHealthItem");

            migrationBuilder.DropTable(
                name: "umbraDesktopMediaHealthOrphan");
        }
    }
}
