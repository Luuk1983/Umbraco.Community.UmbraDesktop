# Derive the target develop branch from the source main branch (e.g. refs/heads/main -> refs/heads/develop, refs/heads/v13/main -> refs/heads/v13/develop)
$env:TargetBranch = $env:SourceBranch -replace '/main$', '/develop'

Write-Output "About to create a pull request from branch $($env:SourceBranch) to $($env:TargetBranch) in repository $($env:RepositoryName)"

# Construct base URLs for API calls
$apisUrl = "$($env:SYSTEM_TEAMFOUNDATIONCOLLECTIONURI)/$($env:SYSTEM_TEAMPROJECT)/_apis"
$projectUrl = "$apisUrl/git/repositories/$($env:RepositoryName)"

# Create common headers for the API calls
$headers = @{}
$headers.Add("Authorization", "Bearer $env:SYSTEM_ACCESSTOKEN")
$headers.Add("Content-Type", "application/json")

# Create the data to perform an API call to create Pull Request
$pullRequestUrl = "$projectUrl/pullrequests?api-version=5.1"
$pullRequest = @{
        "sourceRefName" = $env:SourceBranch
        "targetRefName" = $env:TargetBranch
        "title" = "Auto generated pull request from $($env:SourceBranch)"
        "description" = "This is an automatically generated pull request from $($env:SourceBranch) to $($env:TargetBranch). In most cases this is meant as an automatic back merge and can usually be accepted automatically. But always check if this is the case!"
    }
$pullRequestJson = ($pullRequest | ConvertTo-Json -Depth 5)

Write-Output "Sending a REST call to create a new pull request to $pullRequestUrl..."
# REST Call API to create a Pull Request
$pullRequestResult = Invoke-RestMethod -Method POST -Headers $headers -Body $pullRequestJson -Uri $pullRequestUrl;
$pullRequestId = $pullRequestResult.pullRequestId
Write-Output "Pull request created. Pull Request Id: $pullRequestId"

# Create the data to perform an API call to auto-complete the pull request
$setAutoComplete = @{
    "autoCompleteSetBy" = @{
        "id" = $pullRequestResult.createdBy.id
    }
    "completionOptions" = @{       
        "deleteSourceBranch" = $False
        "bypassPolicy" = $False
    }
}

$setAutoCompleteJson = ($setAutoComplete | ConvertTo-Json -Depth 5)
Write-Output "Sending a REST call to set auto-complete on the newly created pull request..."
# REST call to set auto-complete on Pull Request
$pullRequestUpdateUrl = ($projectUrl + '/pullRequests/' + $pullRequestId + '?api-version=5.1')
$setAutoCompleteResult = Invoke-RestMethod -Method PATCH -Headers $headers -Body $setAutoCompleteJson -Uri $pullRequestUpdateUrl
Write-Output "Pull request set to auto-complete!"