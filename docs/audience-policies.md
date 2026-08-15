# Audience Policies

ESI Web TV uses explicit audience policies instead of inferring access from `isPublic`, nullable modules, or free-form user year groups.

## Audience Types

| Audience | Who can view |
| --- | --- |
| `PUBLIC` | Anonymous visitors and signed-in users |
| `ESI` | Approved signed-in ESI users with a non-guest role |
| `MODULE` | The owner, admins, students enrolled in the module, and teachers assigned to the module |
| `COHORT` | The owner, admins, and users with matching cohort membership |
| `SELECTED_USERS` | The owner, admins, and explicitly selected users |

Owners can view and manage their own content. Admins can view and manage all content. Pending or rejected users are treated as unprovisioned and can only access public content.

## Publishing Rules

Teachers can publish public and ESI-wide content. Teachers can publish module content only for modules assigned to them. Admins can publish to every audience.

Upload and live-stream forms require an explicit audience choice. Club and explanation videos are no longer silently forced public.

## Provisioning

Locally created users are approved by admins during creation. Newly created OAuth users enter `PENDING` provisioning with the `GUEST` role. Admins must approve the account, assign the role/year group, and manage cohort/module assignments from User Management before the user receives private access.

## Compatibility

The audience migration translates existing data as follows:

| Existing record | New audience |
| --- | --- |
| `isPublic = true` | `PUBLIC` |
| private record with `moduleId` | `MODULE` |
| private record without `moduleId` | `ESI` |

Existing student `yearGroup` values are converted into cohort memberships and module enrollments for modules in the same year group. Policy checks use those membership rows, not the free-form `yearGroup` string.
