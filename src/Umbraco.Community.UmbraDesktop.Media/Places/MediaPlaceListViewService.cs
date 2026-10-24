using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.OperationStatus;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Media.Places;

/// <summary>
/// Umbraco's media list view service, with one thing added: it lists what is under a media item whose
/// type has no collection, which Umbraco's own refuses (<c>ContentNotCollection</c>).
/// </summary>
/// <remarks>
/// <para>
/// The Media Manager shows such an item as a place of its own when a site's Structure settings let it
/// hold items, an image under an image say (issue #158, design §19). Its window is Umbraco's own media
/// collection, which asks the management API for the item's collection, so with this the grid, table,
/// columns, sort, filter, paging, selection and bulk actions all stay Umbraco's.
/// </para>
/// <para>
/// A decorator, so every request Umbraco answers is still answered by Umbraco, untouched: the root, a
/// collection, a list view named as a property, an item that does not exist. Only the one it refuses is
/// answered here, the way Umbraco's own <c>ContentListViewServiceBase</c> answers the root: the default
/// media list view's configuration, its ordering rules, children from the media search, and each one
/// checked with Umbraco's media authorizer. The access check is per item, as Umbraco 17.0 does it;
/// <c>FilterAuthorizedAsync</c> came later in 17, and this package is built against 17.0.
/// </para>
/// </remarks>
/// <param name="umbraco">Umbraco's own media list view service.</param>
/// <param name="mediaService">Reads the item asked about.</param>
/// <param name="mediaTypeService">Reads whether its type has a collection.</param>
/// <param name="dataTypeService">Reads the default media list view.</param>
/// <param name="mediaSearchService">Lists the item's children, filtered, ordered and paged.</param>
/// <param name="mediaPermissionAuthorizer">Leaves out what the person may not see.</param>
public sealed class MediaPlaceListViewService(
    IMediaListViewService umbraco,
    IMediaService mediaService,
    IMediaTypeService mediaTypeService,
    IDataTypeService dataTypeService,
    IMediaSearchService mediaSearchService,
    IMediaPermissionAuthorizer mediaPermissionAuthorizer) : IMediaListViewService
{
    /// <summary>
    /// Umbraco's own service, which answers everything but an item that is no collection.
    /// </summary>
    public IMediaListViewService Umbraco => umbraco;

    /// <inheritdoc />
    public async Task<Attempt<ListViewPagedModel<IMedia>?, ContentCollectionOperationStatus>> GetListViewItemsByKeyAsync(
        IUser user,
        Guid? key,
        Guid? dataTypeKey,
        string orderBy,
        Direction orderDirection,
        string? filter,
        int skip,
        int take)
    {
        if (key is null || dataTypeKey is not null || !await IsPlaceWithoutCollectionAsync(key.Value))
        {
            return await umbraco.GetListViewItemsByKeyAsync(user, key, dataTypeKey, orderBy, orderDirection, filter, skip, take);
        }

        if ((await dataTypeService.GetAsync(Constants.DataTypes.Guids.ListViewMediaGuid))?.ConfigurationObject is not ListViewConfiguration configuration)
        {
            return Fail(ContentCollectionOperationStatus.CollectionNotFound);
        }

        Attempt<Ordering?, ContentCollectionOperationStatus> ordering = OrderingFor(configuration, orderBy, orderDirection);
        if (!ordering.Success)
        {
            return Fail(ordering.Status);
        }

        // The overload with every parameter, current from 17.4 (below the floor) and in 18; the short one is
        // obsolete from 17.4 and goes in 19. Every property, as before, since the collection's columns
        // read them. Templates are a document matter, which media searches ignore.
        PagedModel<IMedia> children = await mediaSearchService.SearchChildrenAsync(
            filter, key, propertyAliases: null, ordering.Result!, loadTemplates: false, skip, take);
        var allowed = new List<IMedia>();
        foreach (IMedia child in children.Items)
        {
            if (!await mediaPermissionAuthorizer.IsDeniedAsync(user, [child.Key]))
            {
                allowed.Add(child);
            }
        }

        // The total stays the search's, as Umbraco's own list view leaves it after filtering a page.
        var result = new ListViewPagedModel<IMedia>
        {
            Items = new PagedModel<IMedia>(children.Total, allowed),
            ListViewConfiguration = configuration,
        };
        return Attempt.SucceedWithStatus<ListViewPagedModel<IMedia>?, ContentCollectionOperationStatus>(ContentCollectionOperationStatus.Success, result);
    }

    /// <summary>
    /// Whether an item is one this service answers for: it exists, and its type has no collection.
    /// </summary>
    /// <param name="key">The item's key.</param>
    /// <returns>True when Umbraco would refuse to list it.</returns>
    private async Task<bool> IsPlaceWithoutCollectionAsync(Guid key)
    {
        IMedia? media = mediaService.GetById(key);
        if (media is null)
        {
            return false;
        }

        IMediaType? type = await mediaTypeService.GetAsync(media.ContentType.Key);
        return type is not null && type.ListView is null;
    }

    /// <summary>
    /// The order to list in, by Umbraco's list view rules: a column of the list view or the name,
    /// "creator" read as "owner", and a column that is not a system one ordered as a custom field.
    /// </summary>
    /// <param name="configuration">The list view's configuration.</param>
    /// <param name="orderBy">What the collection asks to order by.</param>
    /// <param name="orderDirection">Which way.</param>
    /// <returns>The ordering, or Umbraco's status for one it would refuse.</returns>
    private static Attempt<Ordering?, ContentCollectionOperationStatus> OrderingFor(
        ListViewConfiguration configuration,
        string orderBy,
        Direction orderDirection)
    {
        ListViewConfiguration.Property[] columns = configuration.IncludeProperties ?? [];
        if (columns.Length == 0)
        {
            return Attempt.FailWithStatus<Ordering?, ContentCollectionOperationStatus>(ContentCollectionOperationStatus.MissingPropertiesInCollectionConfiguration, null);
        }

        if (!columns.Any(column => column.Alias == orderBy) && !orderBy.InvariantEquals("name"))
        {
            return Attempt.FailWithStatus<Ordering?, ContentCollectionOperationStatus>(ContentCollectionOperationStatus.OrderByNotPartOfCollectionConfiguration, null);
        }

        if (orderBy.InvariantEquals("creator"))
        {
            orderBy = "owner";
        }

        var custom = columns.Any(column => column.Alias == orderBy && !column.IsSystem);
        return Attempt.SucceedWithStatus<Ordering?, ContentCollectionOperationStatus>(
            ContentCollectionOperationStatus.Success,
            Ordering.By(orderBy, orderDirection, null, custom));
    }

    /// <summary>A refusal with Umbraco's status, which its controller turns into its own response.</summary>
    /// <param name="status">The status.</param>
    /// <returns>The failed attempt.</returns>
    private static Attempt<ListViewPagedModel<IMedia>?, ContentCollectionOperationStatus> Fail(ContentCollectionOperationStatus status) =>
        Attempt.FailWithStatus<ListViewPagedModel<IMedia>?, ContentCollectionOperationStatus>(status, null);
}
