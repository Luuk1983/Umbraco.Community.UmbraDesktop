using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class ItemTrashed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Trashed",
                table: "umbraDesktopMediaHealthItem",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Trashed",
                table: "umbraDesktopMediaHealthItem");
        }
    }
}
