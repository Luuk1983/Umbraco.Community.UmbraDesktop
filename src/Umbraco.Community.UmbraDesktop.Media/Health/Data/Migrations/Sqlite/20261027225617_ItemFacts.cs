using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class ItemFacts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Height",
                table: "umbraDesktopMediaHealthItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedUtc",
                table: "umbraDesktopMediaHealthItem",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "Url",
                table: "umbraDesktopMediaHealthItem",
                type: "TEXT",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Width",
                table: "umbraDesktopMediaHealthItem",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Height",
                table: "umbraDesktopMediaHealthItem");

            migrationBuilder.DropColumn(
                name: "UpdatedUtc",
                table: "umbraDesktopMediaHealthItem");

            migrationBuilder.DropColumn(
                name: "Url",
                table: "umbraDesktopMediaHealthItem");

            migrationBuilder.DropColumn(
                name: "Width",
                table: "umbraDesktopMediaHealthItem");
        }
    }
}
