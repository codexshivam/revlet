import { 
  getDocs, 
  setDoc, 
  query, 
  collection, 
  where, 
  doc, 
  getDoc, 
  serverTimestamp 
} from "firebase/firestore"

export async function syncUserOrganizations(
  db: any, 
  userId: string, 
  userEmail: string, 
  userDisplayName: string
) {
  if (!db || !userId || !userEmail) return
  try {
    // 1. Fetch organizations owned by the user
    const orgsRef = collection(db, "organizations")
    const qOwned = query(orgsRef, where("ownerId", "==", userId))
    const ownedSnap = await getDocs(qOwned)
    const ownedOrgs = ownedSnap.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || "Unknown Institution",
      domain: doc.data().domain || "",
      role: "owner"
    }))

    // 2. Fetch organizations the user is invited to as a team member
    const membersRef = collection(db, "teamMembers")
    const qInvited = query(membersRef, where("email", "==", userEmail), where("status", "==", "Active"))
    const invitedSnap = await getDocs(qInvited)
    
    // Fetch domains for these organizations for thorough details
    const invitedOrgs = await Promise.all(invitedSnap.docs.map(async (memberDoc) => {
      const memberData = memberDoc.data()
      let domain = ""
      try {
        const orgDoc = await getDoc(doc(db, "organizations", memberData.organizationId))
        if (orgDoc.exists()) {
          domain = orgDoc.data().domain || ""
        }
      } catch (e) {
        console.error("Error fetching org domain during sync:", e)
      }
      return {
        id: memberData.organizationId,
        name: memberData.organizationName || "Unknown Institution",
        domain: domain,
        role: "member"
      }
    }))

    // 3. De-duplicate organizations by ID
    const allOrgsMap = new Map<string, any>()
    ownedOrgs.forEach(org => allOrgsMap.set(org.id, org))
    invitedOrgs.forEach(org => allOrgsMap.set(org.id, org))
    const uniqueOrgs = Array.from(allOrgsMap.values())

    // 4. Update the user's document
    const userRef = doc(db, "users", userId)
    await setDoc(userRef, {
      uid: userId,
      email: userEmail,
      displayName: userDisplayName || "",
      numOrganizations: uniqueOrgs.length,
      organizations: uniqueOrgs,
      updatedAt: serverTimestamp()
    }, { merge: true })

    console.log(`Synced ${uniqueOrgs.length} organizations in document /users/${userId}`)
  } catch (error) {
    console.error("Error syncing user organizations:", error)
  }
}
