import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ProvisioningStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/current-user"
import {
  createUser,
  disableUser,
  enableUser,
  resetUserPassword,
  revokeUserSessionsAction,
  updateUserAssignments,
  updateUserRole,
} from "./actions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Users | ESI Web TV",
}

export default async function UsersPage() {
  const currentUser = await getCurrentUser()
  if (currentUser?.role !== "ADMIN" || currentUser.provisioningStatus !== ProvisioningStatus.APPROVED) {
    redirect("/dashboard")
  }

  const [users, modules, cohorts] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      include: {
        cohortMemberships: { select: { cohortId: true } },
        moduleEnrollments: { select: { moduleId: true } },
        teacherAssignments: { select: { moduleId: true } },
      },
    }),
    prisma.module.findMany({
      orderBy: [{ yearGroup: "asc" }, { name: "asc" }],
    }),
    prisma.cohort.findMany({
      orderBy: [{ yearGroup: "asc" }, { name: "asc" }],
    }),
  ])

  return (
    <main className="page">
      <section className="container">
        <div className="section-header">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="page-title">User Management</h1>
            <p className="lead">Create ESI accounts and keep roles aligned with platform access.</p>
          </div>
        </div>

        <div className="split-layout">
          <aside className="panel">
            <div className="panel-header">
              <h2 className="section-title">Create user</h2>
            </div>
            <form action={createUser} className="form-stack">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" type="text" required className="form-input" />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required className="form-input" placeholder="name@esi.dz" />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" required className="form-input" />
              </div>
              <div className="field">
                <label htmlFor="role">Role</label>
                <select id="role" name="role" required className="form-select" defaultValue="STUDENT">
                  <option value="GUEST">Guest</option>
                  <option value="STUDENT">Student</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="yearGroup">Year group</label>
                <input id="yearGroup" name="yearGroup" type="text" placeholder="1CP" className="form-input" />
              </div>
              <button type="submit" className="button">Create user</button>
            </form>
          </aside>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="section-title">Existing users</h2>
                <p className="muted">{users.length} account{users.length === 1 ? "" : "s"}</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Year</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name || "Unnamed"}</td>
                      <td>{user.email}</td>
                      <td><span className="badge">{user.role}</span></td>
                      <td><span className="badge">{user.provisioningStatus}</span></td>
                      <td>{user.yearGroup || "-"}</td>
                      <td>
                        {user.id === currentUser.id ? (
                          <span className="muted small">Current user</span>
                        ) : (
                          <div className="actions">
                            <form action={updateUserRole} className="actions">
                              <input type="hidden" name="id" value={user.id} />
                              <select name="role" defaultValue={user.role} className="form-select" aria-label={`Role for ${user.email}`}>
                                <option value="GUEST">Guest</option>
                                <option value="STUDENT">Student</option>
                                <option value="TEACHER">Teacher</option>
                                <option value="ADMIN">Admin</option>
                              </select>
                              <select
                                name="provisioningStatus"
                                defaultValue={user.provisioningStatus}
                                className="form-select"
                                aria-label={`Provisioning status for ${user.email}`}
                              >
                                {Object.values(ProvisioningStatus).map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                              <input
                                name="yearGroup"
                                defaultValue={user.yearGroup || ""}
                                placeholder="1CP"
                                className="form-input"
                                aria-label={`Year group for ${user.email}`}
                              />
                              <button type="submit" className="button-quiet">Update</button>
                            </form>
                            {user.isActive ? (
                              <form action={disableUser} className="inline-confirm-form">
                                <input type="hidden" name="id" value={user.id} />
                                <label className="checkbox-row">
                                  <input type="checkbox" name="confirm" required />
                                  <span>Confirm disable</span>
                                </label>
                                <button type="submit" className="button-quiet">Disable</button>
                              </form>
                            ) : (
                              <form
                                action={async () => {
                                  "use server"
                                  await enableUser(user.id)
                                }}
                              >
                                <button type="submit" className="button-quiet">Enable</button>
                              </form>
                            )}
                            <form action={revokeUserSessionsAction}>
                              <input type="hidden" name="id" value={user.id} />
                              <label className="checkbox-row">
                                <input type="checkbox" name="confirm" required />
                                <span>Confirm revoke</span>
                              </label>
                              <button type="submit" className="button-quiet">Revoke sessions</button>
                            </form>
                            <details className="assignment-details">
                              <summary>Reset password</summary>
                              <form action={resetUserPassword} className="form-stack assignment-form">
                                <input type="hidden" name="id" value={user.id} />
                                <div className="field">
                                  <label htmlFor={`password-${user.id}`}>New password</label>
                                  <input
                                    id={`password-${user.id}`}
                                    name="password"
                                    type="password"
                                    minLength={12}
                                    required
                                    className="form-input"
                                  />
                                </div>
                                <button type="submit" className="button-quiet">Reset password</button>
                              </form>
                            </details>
                            <details className="assignment-details">
                              <summary>Assignments</summary>
                              <form action={updateUserAssignments} className="form-stack assignment-form">
                                <input type="hidden" name="id" value={user.id} />
                                {cohorts.length > 0 && (
                                  <fieldset className="assignment-fieldset">
                                    <legend>Cohorts</legend>
                                    {cohorts.map((cohort) => (
                                      <label key={cohort.id} className="checkbox-row">
                                        <input
                                          type="checkbox"
                                          name="cohortId"
                                          value={cohort.id}
                                          defaultChecked={user.cohortMemberships.some((membership) => membership.cohortId === cohort.id)}
                                        />
                                        <span>{cohort.name}</span>
                                      </label>
                                    ))}
                                  </fieldset>
                                )}
                                {user.role === "STUDENT" && (
                                  <fieldset className="assignment-fieldset">
                                    <legend>Student modules</legend>
                                    {modules.map((module) => (
                                      <label key={module.id} className="checkbox-row">
                                        <input
                                          type="checkbox"
                                          name="studentModuleId"
                                          value={module.id}
                                          defaultChecked={user.moduleEnrollments.some((enrollment) => enrollment.moduleId === module.id)}
                                        />
                                        <span>{module.yearGroup} · {module.name}</span>
                                      </label>
                                    ))}
                                  </fieldset>
                                )}
                                {user.role === "TEACHER" && (
                                  <fieldset className="assignment-fieldset">
                                    <legend>Teacher modules</legend>
                                    {modules.map((module) => (
                                      <label key={module.id} className="checkbox-row">
                                        <input
                                          type="checkbox"
                                          name="teacherModuleId"
                                          value={module.id}
                                          defaultChecked={user.teacherAssignments.some((assignment) => assignment.moduleId === module.id)}
                                        />
                                        <span>{module.yearGroup} · {module.name}</span>
                                      </label>
                                    ))}
                                  </fieldset>
                                )}
                                <button type="submit" className="button-quiet">Save assignments</button>
                              </form>
                            </details>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6}>No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
