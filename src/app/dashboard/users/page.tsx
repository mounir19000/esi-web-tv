import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { createUser, deleteUser } from "./actions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Users | ESI Web TV",
}

export default async function UsersPage() {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
  })

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
                      <td>{user.yearGroup || "-"}</td>
                      <td>
                        {user.id === session.user.id ? (
                          <span className="muted small">Current user</span>
                        ) : (
                          <form
                            action={async () => {
                              "use server"
                              await deleteUser(user.id)
                            }}
                          >
                            <button type="submit" className="button-quiet">Delete</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5}>No users found.</td>
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
