import { waitFor } from "@testing-library/react"
import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore"
import { nanoid } from "nanoid"
import { auth, firestore } from "../../components/firebase"
import { setRole } from "../../functions/src/auth"
import { terminateFirebase, testAuth, testDb } from "../testUtils"
import {
  expectPermissionDenied,
  getProfile,
  setNewProfile,
  signInUser,
  signInUser1,
  signInUser2
} from "./common"

import { fail } from "../../functions/src/common"

const fakeUser = () => ({
  uid: nanoid(),
  fullName: "Conan O'Brien",
  email: `${nanoid()}@example.com`,
  password: "password"
})

afterAll(terminateFirebase)

describe("profile", () => {
  async function expectProfile(newUser: any) {
    await testAuth.createUser(newUser)
    await setNewProfile(newUser)

    let profile: any
    await waitFor(
      async () => {
        profile = await getProfile(newUser)
        expect(profile).toBeTruthy()
      },
      { timeout: 5000, interval: 250 }
    )
    return profile
  }

  async function testDBConnection() {
    const newUser = fakeUser()
    await setNewProfile(newUser)
    let profile = await getProfile(newUser)
    return profile
  }

  it("tests db conn", async () => {
    const profile = await testDBConnection()
    expect(profile).toBeDefined()
  })

  it("Sets the fullName for new users", async () => {
    const expected = fakeUser()
    expect(await getProfile(expected)).toBeUndefined()
    const profile = await expectProfile(expected)
    expect(profile.fullName).toEqual(expected.fullName)
    expect(profile.role).not.toBeDefined()
  })

  it("Is publicly readable by default", async () => {
    // this req was updated in June 2023
    const newUser = fakeUser()
    await testAuth.createUser(newUser)
    const profileRef = testDb.doc(`profiles/${newUser.uid}`)
    await profileRef.set(newUser)
    await profileRef.update("public", true)
    await signInUser1()
    const newProfile = await getDoc(doc(firestore, `profiles/${newUser.uid}`))
    expect(newProfile.exists).toBeTruthy()

    await signOut(auth)
  })

  it("Is publicly readable when public", async () => {
    const user1 = await signInUser1()
    const profileRef = doc(firestore, `profiles/${user1.uid}`)
    await setPublic(profileRef, true)
    expect(
      (await getDoc(doc(firestore, `profiles/${user1.uid}`))).data()
    ).toBeTruthy()

    await signOut(auth)
    await signInUser2()
    expect(
      (await getDoc(doc(firestore, `profiles/${user1.uid}`))).data()
    ).toBeTruthy()

    await signOut(auth)
  })

  it("Is not publicly readable when not public", async () => {
    const user1 = await signInUser1()
    const profileRef = doc(firestore, `profiles/${user1.uid}`)
    await setPublic(profileRef, false)

    await signInUser2()
    await expectPermissionDenied(
      getDoc(doc(firestore, `profiles/${user1.uid}`))
    )
  })

  it("Is readable when not public by own user", async () => {
    const user1 = await signInUser1()
    const profileRef = doc(firestore, `profiles/${user1.uid}`)
    await setPublic(profileRef, false)

    const result = await getDoc(doc(firestore, `profiles/${user1.uid}`))
    expect(result.exists()).toBeTruthy()
  })

  it("Can only be modified by the logged in user", async () => {
    const newUser = fakeUser()
    const profileRef = doc(firestore, `profiles/${newUser.uid}`)
    await expectProfile(newUser)

    await signInUser1()
    await expectPermissionDenied(
      setDoc(profileRef, { fullName: "test" }, { merge: true })
    )

    await signInWithEmailAndPassword(auth, newUser.email, newUser.password)

    await expect(
      setDoc(profileRef, { fullName: "test" }, { merge: true })
    ).resolves.toBeUndefined()
  })

  it("Does not allow deleting the profile or changing the role", async () => {
    const newUser = fakeUser()
    const profileRef = doc(firestore, `profiles/${newUser.uid}`)
    await expectProfile(newUser)
    await signInUser(newUser.email)

    await expectPermissionDenied(updateDoc(profileRef, { role: "admin" }))
    await expectPermissionDenied(deleteDoc(profileRef))
  })

  async function setPublic(doc: any, isPublic: boolean) {
    await setDoc(doc, { public: isPublic }, { merge: true })
  }
})
