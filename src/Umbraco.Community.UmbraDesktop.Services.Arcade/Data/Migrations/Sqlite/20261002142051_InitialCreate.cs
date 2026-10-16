using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "umbraDesktopArcadeBeaten",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserKey = table.Column<Guid>(type: "TEXT", nullable: false),
                    Game = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Board = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    ByUserKey = table.Column<Guid>(type: "TEXT", nullable: false),
                    Value = table.Column<long>(type: "INTEGER", nullable: false),
                    AtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopArcadeBeaten", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopArcadeLeaderboard",
                columns: table => new
                {
                    Game = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Board = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Better = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Format = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Min = table.Column<long>(type: "INTEGER", nullable: true),
                    Max = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopArcadeLeaderboard", x => new { x.Game, x.Board });
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopArcadeProfile",
                columns: table => new
                {
                    UserKey = table.Column<Guid>(type: "TEXT", nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    IsPublic = table.Column<bool>(type: "INTEGER", nullable: false),
                    NotifyWhenBeaten = table.Column<bool>(type: "INTEGER", nullable: false),
                    AskedAboutPublic = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopArcadeProfile", x => x.UserKey);
                });

            migrationBuilder.CreateTable(
                name: "umbraDesktopArcadeScore",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserKey = table.Column<Guid>(type: "TEXT", nullable: false),
                    Game = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Board = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Value = table.Column<long>(type: "INTEGER", nullable: false),
                    AchievedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_umbraDesktopArcadeScore", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopArcadeBeaten_AtUtc",
                table: "umbraDesktopArcadeBeaten",
                column: "AtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopArcadeBeaten_ByUserKey",
                table: "umbraDesktopArcadeBeaten",
                column: "ByUserKey");

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopArcadeBeaten_UserKey_Game_Board",
                table: "umbraDesktopArcadeBeaten",
                columns: new[] { "UserKey", "Game", "Board" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopArcadeScore_Game_Board",
                table: "umbraDesktopArcadeScore",
                columns: new[] { "Game", "Board" });

            migrationBuilder.CreateIndex(
                name: "IX_umbraDesktopArcadeScore_UserKey_Game_Board",
                table: "umbraDesktopArcadeScore",
                columns: new[] { "UserKey", "Game", "Board" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "umbraDesktopArcadeBeaten");

            migrationBuilder.DropTable(
                name: "umbraDesktopArcadeLeaderboard");

            migrationBuilder.DropTable(
                name: "umbraDesktopArcadeProfile");

            migrationBuilder.DropTable(
                name: "umbraDesktopArcadeScore");
        }
    }
}
