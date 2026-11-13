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
    const qInvited = query(membersRef, where("email", "==", userEmail.toLowerCase().trim()), where("status", "==", "Active"))
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

    // 4. Update the user's document with separated Email Forwarding and Email Service metadata
    const userRef = doc(db, "users", userId)
    const hasMailService = ownedSnap.docs.some(d => Boolean(d.data().mailServiceActive))
    const mailServiceOrgIds = ownedSnap.docs.filter(d => Boolean(d.data().mailServiceActive)).map(d => d.id)

    const hasEmailForwarding = ownedSnap.docs.some(d => Boolean(d.data().emailForwardingActive || d.data().emailServiceActive))
    const forwardingOrgIds = ownedSnap.docs.filter(d => Boolean(d.data().emailForwardingActive || d.data().emailServiceActive)).map(d => d.id)

    await setDoc(userRef, {
      email: userEmail,
      displayName: userDisplayName || "",
      numOrganizations: uniqueOrgs.length,
      organizations: uniqueOrgs.map(org => org.id),
      serviceType: 'user_profile',
      emailService: {
        enabled: hasMailService,
        activeOrgIds: mailServiceOrgIds,
      },
      emailForwarding: {
        enabled: hasEmailForwarding,
        activeOrgIds: forwardingOrgIds,
      },
      updatedAt: serverTimestamp()
    }, { merge: true })

    console.log(`Synced ${uniqueOrgs.length} organizations in document /users/${userId}`)
  } catch (error) {
    console.error("Error syncing user organizations:", error)
  }
}
