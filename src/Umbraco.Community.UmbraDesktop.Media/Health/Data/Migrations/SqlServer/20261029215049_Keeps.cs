using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class Keeps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "umbraDesktopMediaHealthKeep",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Kind = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Target = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Fingerprint = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    UntilUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    KeptBy = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    KeptByName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    KeptUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopMediaHealthKeep", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "umbraDesktopMediaHealthKeep");
        }
    }
}
