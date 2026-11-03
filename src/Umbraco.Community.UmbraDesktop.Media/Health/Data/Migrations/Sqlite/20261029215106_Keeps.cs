using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data.Migrations.Sqlite
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
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Target = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    Fingerprint = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Note = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    UntilUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    KeptBy = table.Column<Guid>(type: "TEXT", nullable: false),
                    KeptByName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    KeptUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
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
