using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data.Migrations.SqlServer
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
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    StartedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    TouchedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    FinishedUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Phase = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Scanned = table.Column<int>(type: "int", nullable: false),
                    Total = table.Column<int>(type: "int", nullable: false),
                    Error = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    StartedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Items = table.Column<int>(type: "int", nullable: false),
                    Folders = table.Column<int>(type: "int", nullable: false),
                    Orphans = table.Column<int>(type: "int", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    OrphanBytes = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthCheck", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthFolder",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CheckId = table.Column<int>(type: "int", nullable: false),
                    Key = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ParentKey = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Path = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthFolder", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthItem",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CheckId = table.Column<int>(type: "int", nullable: false),
                    Key = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    MediaTypeAlias = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    Extension = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    ParentKey = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Path = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    UsageCount = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthItem", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthOrphan",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CheckId = table.Column<int>(type: "int", nullable: false),
                    RelativePath = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Url = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    LastModifiedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
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
