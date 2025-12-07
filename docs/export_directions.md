# ServiceNow Instance Transfer Guide

A comprehensive guide for transferring configurations and customizations between ServiceNow instances using Update Sets.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Method 1: Transfer Using Update Sets (Recommended)](#method-1-transfer-using-update-sets-recommended)
  - [Part 1: Preparing the Source Instance](#part-1-preparing-the-source-instance)
  - [Part 2: Configuring the Target Instance](#part-2-configuring-the-target-instance)
  - [Part 3: Retrieving and Applying Update Sets](#part-3-retrieving-and-applying-update-sets)
  - [Part 4: Verification](#part-4-verification)
- [Method 2: Transfer Using XML Export/Import](#method-2-transfer-using-xml-exportimport)
  - [Part 1: Consolidating Work](#part-1-consolidating-work)
  - [Part 2: Export Update Set](#part-2-export-update-set)
  - [Part 3: Import into Target Instance](#part-3-import-into-target-instance)
- [Method 3: Exporting Default Update Set](#method-3-exporting-default-update-set)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [What Gets Transferred](#what-gets-transferred)

---

## Overview

Update Sets are ServiceNow's mechanism for moving configurations between instances (Development → UAT → Production). This guide covers multiple methods for transferring your work.

## Prerequisites

- ✅ Access to both ServiceNow instances (source and target)
- ✅ Admin credentials for both instances
- ✅ Both instances should ideally be on the same version to avoid compatibility issues
- ✅ Don't work on the Default update set for production work

---

## Method 1: Transfer Using Update Sets (Recommended)

> **Best for:** Regular deployments when both instances can connect to each other

### Part 1: Preparing the Source Instance

#### Step 1: Create a New Update Set

1. Navigate to **System Update Sets > Local Update Sets**
2. Click **New** to create a new update set
3. Provide a meaningful name (e.g., `Project_v1.0`)
4. Add a description to identify the changes
5. Click **Submit and Make Current**

#### Step 2: Make Your Changes

- All modifications you make while this update set is current will be **automatically captured**
- This includes: tables, forms, scripts, workflows, catalog items, etc.

#### Step 3: Complete the Update Set

1. When finished making changes, go to **System Update Sets > Local Update Sets**
2. Click on your update set
3. Change the **State** field from "In Progress" to **Complete**
4. Click **Update**

### Part 2: Configuring the Target Instance

#### Step 4: Set Up Update Source

1. Log into the **target instance** (where you want to receive the changes)
2. Navigate to **System Update Sets > Update Sources**
3. Click **New**
4. Fill in the following fields:
   - **Name**: A descriptive name (e.g., "Dev Instance")
   - **URL**: The full URL of your source instance (e.g., `dev353493.service-now.com`)
   - **Username**: Admin username from source instance
   - **Password**: Admin password from source instance
5. Click **Test Connection** to verify the connection works
6. Click **Submit**

### Part 3: Retrieving and Applying Update Sets

#### Step 5: Retrieve the Update Set

1. In the target instance, navigate to **System Update Sets > Retrieved Update Sets**
2. Click on the update source you just created
3. Click **Retrieve Completed Update Sets**
4. Select the update set you want to transfer
5. Click **Retrieve**

#### Step 6: Preview the Update Set

1. Once retrieved, the update set will appear in the list with a state of **"Loaded"**
2. Click on the update set name
3. Review any warnings or errors in the **Preview Problems** section
4. Click **Preview Update Set** to see what will be changed
5. Address any conflicts by choosing to:
   - **Accept Remote Update**: Use the incoming change
   - **Skip**: Keep the current version

#### Step 7: Commit the Update Set

1. After resolving all issues, click **Commit Update Set**
2. Wait for the commit process to complete
3. The state will change to **"Committed"**

### Part 4: Verification

Now that the update set is committed, verify that your data and configurations transferred successfully:

#### For Custom Tables

1. In the target instance, use the **Filter Navigator** (search bar in the top-left)
2. Search for your custom table name (e.g., "Certificate Requests")
3. Click on the table to view records
4. Verify that the table structure (fields, columns) matches your source instance

#### For Service Catalog Items

1. Navigate to **Service Catalog > Catalog Items**
2. Search for your catalog item by name
3. Click on it to view the configuration
4. Test the item by clicking **Try It** to ensure it functions correctly

#### For Service Portal Pages

1. Navigate to **Service Portal > Pages**
2. Use the filter to search for your page by title or ID
3. Click on the page name to view its configuration
4. Click **Try It** or copy the URL to view the page in your browser
5. Test all links and functionality on the page

#### For Scripts and Business Rules

1. Navigate to **System Definition > Business Rules** (or the appropriate module)
2. Search for your custom scripts by name
3. Verify the code transferred correctly

#### For Workflows

1. Navigate to **Workflow > Workflow Editor**
2. Search for your workflow
3. Open it to verify all activities and conditions transferred

#### General Verification Tips

- ✅ Check the **Customer Updates** section in tables to see what was modified by the update set
- ✅ Test any forms, fields, or UI elements that were part of the transfer
- ✅ If using Service Portal pages, test all interactive elements and links
- ✅ Verify any access controls or permissions transferred correctly
- ✅ Test end-to-end functionality to ensure all dependencies are working

---

## Method 2: Transfer Using XML Export/Import

> **Best for:** One-time transfers, offline transfers, or when instances can't connect to each other

### Part 1: Consolidating Work

#### If All Changes Were Made Before Creating an Update Set

> ⚠️ **IMPORTANT**: If you made all your changes BEFORE creating an update set, those changes are likely in the "Default" update set. You need to manually add all your components to a new, named update set.

##### Step 1: Identify What You've Created

Before creating a new update set, make a list of everything you've built:

- [ ] Custom tables
- [ ] Catalog items and categories
- [ ] Service Portal pages
- [ ] Variables and variable sets
- [ ] Scripts (Client Scripts, Business Rules, UI Policies, etc.)
- [ ] Widgets
- [ ] Forms and views
- [ ] UI Pages
- [ ] ACLs/Access Controls

**💡 Tip**: Write down the names of all components before you start - this will serve as your checklist.

##### Step 2: Create a New Update Set

1. Navigate to **System Update Sets > Local Update Sets**
2. Click **New**
3. Name it appropriately (e.g., `Complete_Project_v1.0`)
4. Add a detailed description of what's included
5. Click **Submit and Make Current**

> ⚠️ **Important**: This new update set will only capture NEW changes made after you create it - you must manually add existing components.

##### Step 3: Manually Add ALL Existing Components

You need to add every component you created. Here's how:

###### For Custom Tables

1. Navigate to **System Definition > Tables**
2. Find all your custom tables
3. For EACH table:
   - Click to open the table record
   - Right-click on the **header bar** (gray area at top)
   - Select **Add to Update Set** or **Update or Add to Update Set**
4. Also add related components:
   - Form layouts (Configure > Form Layout, then right-click and add)
   - List layouts (Configure > List Layout, then right-click and add)

###### For Catalog Items

1. Navigate to **Service Catalog > Catalog Items**
2. Search for your catalog items
3. For EACH catalog item:
   - Open the catalog item
   - Right-click on the header bar
   - Select **Add to Update Set**
4. Also add the catalog category:
   - Navigate to **Service Catalog > Categories**
   - Open each category and add to update set

###### For Variables

> ⚠️ **Variables don't always get added automatically!**

1. Navigate to **Service Catalog > Variable Sets** OR open your catalog item
2. For EACH variable you created:
   - Click to open the variable
   - Right-click on the header bar
   - Select **Add to Update Set**

###### For Service Portal Pages

> ⚠️ **Most Complex**: You must manually add ALL page components

1. Navigate to **Service Portal > Pages**
2. Find your page and open it
3. Right-click on the header bar
4. Select **Unload or Add to Update Set**

**You must also add ALL page components:**

- **Page Containers**: Find Containers related list, open each, add to update set
- **Columns**: From container, find Columns related list, open each, add to update set
- **Rows**: Find Rows related lists, open each, add to update set
- **Widget Instances**: Find Widget Instances, open each, add to update set
- **Custom Widgets**: Navigate to Service Portal > Widgets, add your custom widgets

###### For Scripts

**Client Scripts:**
1. Navigate to **System Definition > Client Scripts**
2. For each script: open, right-click header, add to update set

**Business Rules:**
1. Navigate to **System Definition > Business Rules**
2. For each rule: open, right-click header, add to update set

**UI Policies:**
1. Navigate to **System UI > UI Policies**
2. For each policy: open, right-click header, add to update set
3. Also add **UI Policy Actions** from each policy's related list

**UI Actions:**
1. Navigate to **System UI > UI Actions**
2. For each action: open, right-click header, add to update set

**Script Includes:**
1. Navigate to **System Definition > Script Includes**
2. For each include: open, right-click header, add to update set

**Catalog Client Scripts:**
1. Navigate to **Service Catalog > Catalog Client Scripts**
2. For each script: open, right-click header, add to update set

##### Step 4: Verify ALL Components Are Included

> 🔍 **This is the most important step!**

1. Go to **System Update Sets > Local Update Sets**
2. Click on your update set
3. Scroll down to the **Customer Updates** related list
4. Review the list carefully and verify you see:
   - ✅ All your tables
   - ✅ All your catalog items and categories
   - ✅ All variables (count them!)
   - ✅ All Service Portal pages AND their components
   - ✅ All your scripts
   - ✅ All UI policies and actions
   - ✅ Any other components you created

5. **If anything is missing**: Go back, find the component, right-click header, add to update set

**💡 Pro Tip**: The Customer Updates list shows a "Type" column:
- Tables: `sys_db_object`
- Catalog Items: `sc_cat_item`
- Variables: `item_option_new`
- Client Scripts: `sys_script_client`
- Business Rules: `sys_script`
- Service Portal Pages: `sp_page`

##### Step 5: Complete the Update Set

1. Only after verifying EVERYTHING is included, change **State** to **Complete**
2. Click **Update**

### Part 2: Export Update Set

#### Pre-Export Checklist

- [ ] All custom tables
- [ ] All table columns/fields
- [ ] All form layouts
- [ ] All list layouts
- [ ] All catalog items
- [ ] All catalog categories
- [ ] ALL variables (count them!)
- [ ] All Service Portal pages and components
- [ ] All scripts (client, business rules, etc.)
- [ ] All UI policies and actions
- [ ] All ACLs/access controls

#### Step 6: Export to XML

1. In the source instance, navigate to **System Update Sets > Local Update Sets**
2. Click on your completed update set
3. Scroll to the bottom and click **Export to XML**
4. The XML file will download to your computer
5. Save this file in a location you can easily access

### Part 3: Import into Target Instance

#### Step 7: Import the XML File

1. Log into the **target instance**
2. Navigate to **System Update Sets > Retrieved Update Sets**
3. Click **Import Update Set from XML** (usually at bottom of list)
4. Click **Choose File** and select the XML file you exported
5. Click **Upload**
6. Wait for the upload to complete

#### Step 8: Preview the Imported Update Set

1. After upload, find the newly imported update set in the list
2. Click on it to open
3. The state will be **"Loaded"**
4. Click **Preview Update Set**
5. Review the **Preview Problems** section
6. Address conflicts by choosing **Accept Remote Update** or **Skip**

#### Step 9: Commit the Update Set

1. After resolving all preview problems, click **Commit Update Set**
2. Wait for the commit to complete
3. The state will change to **"Committed"**

#### Step 10: Verify the Transfer

Follow the same verification steps as in Method 1, Part 4.

---

## Method 3: Exporting Default Update Set

> ⚠️ **Not Recommended**: Use only as a last resort

### When to Use This Method

If you:
- Made all changes before creating a named update set
- Don't want to manually add components
- Are okay with potential errors and conflicts
- Need a quick transfer for testing

### Steps

#### 1. Complete the Default Update Set

1. Navigate to **System Update Sets > Local Update Sets**
2. Find "Default" or "Default [Global]" update set
3. Change **State** to **Complete**
4. Click **Update**

#### 2. Export to XML

1. Scroll to bottom of Default update set
2. Click **Export to XML**
3. Save the file

#### 3. Import and Commit

Follow the same import steps as Method 2.

### ⚠️ Warnings About Default Update Set

- **Contains EVERYTHING**: All changes in Global scope, including:
  - Test changes you didn't want
  - Experimental work
  - Accidental system modifications
- **Version Conflicts**: May see 200+ errors during preview
- **Hard to Review**: Difficult to verify what's actually included
- **Not Best Practice**: ServiceNow recommends against this

### What to Do During Preview

1. Review all warnings/errors carefully
2. **Accept** items that are your actual components
3. **Skip** items that look like system records or things you didn't create
4. Test thoroughly after committing

---

## Troubleshooting

### Components Appear in Update Set But Not in Their Modules

If you can see components in the Retrieved Update Set but they don't appear in their actual locations:

#### 1. Check Update Set Status

- Go to **System Update Sets > Retrieved Update Sets**
- Verify status is **"Committed"** (not "Previewed" or "Loaded")
- If still in "Preview", commit it

#### 2. Review Customer Updates

- Click **Customer Updates** tab in the Retrieved Update Set
- This shows what actually got updated
- If tab is empty, commit may not have completed

#### 3. Check for Skipped Updates

- Look at **Customer Updates in Batch** tab
- See if updates were skipped
- Manually accept skipped updates if needed

#### 4. Verify Application Scope

- Check current scope in top-right corner
- Some items only appear in correct scope
- Try switching to "Global" scope

#### 5. Clear Your Cache

- Press **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac)
- Or log out and log back in

#### 6. Search by System ID

- In Retrieved Update Set, note the item's "Name" (alphanumeric string)
- Use Filter Navigator: `<table_name>.do?sys_id=<id_from_update_set>`
- Example: `sc_cat_item.do?sys_id=e4ebc5f093d4321009c1f6fa3d03d640`

#### 7. Check Child Update Sets

- Click **Child Update Sets** tab
- Commit any child update sets separately

#### 8. Re-commit If Necessary

- Back out the update set (if possible)
- Create new version in source instance
- Ensure all components are included
- Retrieve and commit again

---

## Best Practices

### ✅ Do's

- **Always create a named update set** before making changes
- **Use version numbering** (e.g., v1.0, v1.1, v2.0)
- **Test transfers** in non-production environments first
- **Complete one update set** before starting another
- **Verify transfers** by testing functionality
- **Keep XML export files** as backups
- **Document what's in each update set**

### ❌ Don'ts

- **Don't work on the Default update set** for production work
- **Don't skip the verification step**
- **Don't commit without reviewing preview problems**
- **Don't transfer between different ServiceNow versions** without testing
- **Don't assume all components transfer automatically**

---

## What Gets Transferred

### ✅ Included in Update Sets

- Tables (structure only, not data records)
- Forms and form layouts
- Catalog items and categories
- Scripts (Client Scripts, Business Rules, UI Scripts, etc.)
- Workflows
- UI Policies and UI Actions
- Variables and Variable Sets
- Service Portal pages and widgets
- ACLs/Access Controls

### ❌ NOT Included in Update Sets

- Actual data records in tables
- User accounts and credentials
- Some system properties
- Attachments
- Scheduled jobs (transfer but may need reactivation)
- REST message credentials (must be re-entered)

---

## Comparison Table

| Feature | Method 1: Update Sets | Method 2: XML Import | Method 3: Default Export |
|---------|----------------------|---------------------|-------------------------|
| **Connection Required** | ✅ Yes | ❌ No | ❌ No |
| **Ease of Use** | ⭐⭐⭐⭐⭐ Easy | ⭐⭐⭐ Medium | ⭐⭐ Hard |
| **Best For** | Regular deployments | One-time transfers | Last resort |
| **Version Control** | ✅ Automatic | Manual | Manual |
| **Error Prone** | Low | Medium | High |
| **Recommended** | ✅ Yes | ✅ Yes | ❌ No |

---

## Additional Resources

- [ServiceNow Documentation: Update Sets](https://docs.servicenow.com)
- [ServiceNow Community](https://community.servicenow.com)

---

## Contributing

Found an issue or have suggestions? Please contribute to improve this guide!

---

## License

This guide is provided as-is for educational purposes.

---

**Last Updated**: December 2025
