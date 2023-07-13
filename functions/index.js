const {onRequest} = require('firebase-functions/v2/https');
const admin = require("firebase-admin")
const express = require('express');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const cors = require('cors');

// Firebase Configuration
setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

//Main App
const app = express()
app.use(cors());

app.post(('/coinmo/users'), async (req, res) => {
    try{
        // Fix user photo to default if no photo was selected
        let photo
        if(!req.body.photoURL) photo = "https://firebasestorage.googleapis.com/v0/b/coinmo-8a9cd.appspot.com/o/profilePictures%2Fdefault.png?alt=media&token=615c8290-1e8e-43d0-82f9-d2433af4e8c6"
        else photo = req.body.photoURL
        // User creation in Auth API
        await auth.createUser({
            uid: req.body.uid,
            email: req.body.email,
            password: req.body.password,
            displayName: req.body.name,
            photoURL: photo,
        })

        // Calculate User Code
        let code = 1;
        const querySnapshot = await db.collection('users').where('name', '==', req.body.name)
            .get()
        if (!querySnapshot.empty) code = querySnapshot.size + 1
        
        // Calculate Search Name
        const name = req.body.name.toLowerCase();
        const searchName = [];
        for (let i = 1; i <= name.length; i++) {
            const substring = name.substring(0, i);
            searchName.push(substring);
        }

        // Creation of user in database
        await db.collection("users")
        .doc(`/${req.body.uid}`)
        .create({
            name: req.body.name,
            nif: req.body.nif,
            category: req.body.category,
            phoneNumber: req.body.phoneNumber,
            email: req.body.email,
            description: req.body.description,
            address: {
                    street: req.body.address,
                    apartment: req.body.apartment,
                    postalCode: req.body.postalCode,
                    city: req.body.city,
                    country: req.body.country
            },
            photoURL: photo,
            code: `#${String(code).padStart(4, '0')}`,
            searchName: searchName,
            lastInvoice: 0
        });

        
        return res.status(200).json({
            status: "success",
            message: "user created succesfully"
        })
    } catch (error){
        console.log(error)
        return res.status(500).json({
            status: "error",
            message: error.code
        });
    }
    
})

app.get("/coinmo/user", async (req, res) => {
    try{
        // Validate User Token
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const decodedToken = await auth.verifyIdToken(token)

        // Get user data
        const userDoc = await db.collection('users').doc(decodedToken.uid).get()
        const userData = userDoc.data()

        // Send response
        return res.status(200).json({
            status: "success",
            message: {
                name: userData.name,
                nif: userData.nif,
                category: userData.category,
                phoneNumber: userData.phoneNumber,
                email: userData.email,
                description: userData.description,
                address: userData.address.street,
                apartment: userData.address.apartment,
                postalCode: userData.address.postalCode,
                city: userData.address.city,
                country: userData.address.country,
                photoURL: userData.photoURL,
            }
        })
    } catch (error){
        return res.status(500).json({
            status: "error",
            message: error.code
        });
    }
})

app.get(('/coinmo/user/:name'), async (req, res) => {
    
    try {
        let response  = []
         
        const querySnapshot = await db.collection('users').where("searchName", "array-contains", req.params.name.toLowerCase()).get()
        querySnapshot.docs.forEach( (doc) => {
            response.push({
                id: doc.id,
                name: doc.data().name,
                code: doc.data().code,
                category: doc.data().category,
                photoURL: doc.data().photoURL
            }) 
        })
        return res.status(200).json(response)
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.code
        })
    }
})

app.get(('/coinmo/invoice/:id'), async (req, res) => {
    
    try {
        // Validate User Token
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const decodedToken = await auth.verifyIdToken(token)

        //Get Invoice and send to Client
        const invoice = await db.collection('users').doc(decodedToken.uid).collection('invoices').doc(req.params.id).get()
        return res.status(200).json(invoice.data())
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.code
        })
    }
})

app.post(('/coinmo/invoice'), async (req, res) => {
    try {
        // Validate User Token
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        const decodedToken = await auth.verifyIdToken(token)
        
        // Get Customer Information
        const customerId = req.body.customer
        const customerDoc = await db.collection('users').doc(customerId).get()
        const customerData = customerDoc.data()

        // Get Vendor Information
        const vendorId = decodedToken.uid
        const vendorDoc = await db.collection('users').doc(vendorId).get()
        const vendorData = vendorDoc.data()

        // Calculate Invoice Total
        const concept = req.body.concept
        const taxRate = req.body.taxRate
        var taxBase = 0
        Object.keys(concept).map(key =>{
            taxBase += concept[key].amount * concept[key].price * ( 1 - concept[key].sale / 100)
        })
        const total = taxBase * (1 + taxRate / 100)
        
        // Get server timestamp
        const serverTimestamp = Date.now()
        const date = new Date(serverTimestamp)

        const invoice = {
            customer: {
                id: customerId,
                nif: customerData.nif,
                name: customerData.name,
                category: customerData.category,
                photoURL: customerData.photoURL,
                address: {
                    street: customerData.address.street,
                    apartment: customerData.address.apartment,
                    city: customerData.address.city,
                    postalCode: customerData.address.postalCode,
                    country: customerData.address.country,
                },
                contact: {
                    email: customerData.email,
                    phoneNumber: customerData.phoneNumber
                }
            },
            vendor: {
                id: vendorId,
                nif: vendorData.nif,
                name: vendorData.name,
                category: vendorData.category,
                photoURL: vendorData.photoURL,
                address: {
                    street: vendorData.address.street,
                    apartment: vendorData.address.apartment,
                    city: vendorData.address.city,
                    postalCode: vendorData.address.postalCode,
                    country: vendorData.address.country,
                },
                contact: {
                    email: vendorData.email,
                    phoneNumber: vendorData.phoneNumber
                }
            },
            concept: concept,
            observations: req.body.observations,
            paymentMethod: req.body.paymentMethod,
            taxRate: taxRate,
            taxBase: taxBase,
            total: total,
            timestamp: serverTimestamp,
            invoiceId: `F${date.getFullYear()}-${String(vendorData.lastInvoice + 1).padStart(6, '0')}`,
            state: "pending"
        }

        // Creation of the invoice copies for customer and vendor
        const vendorInvoiceRef = db.collection("users").doc(vendorId).collection("invoices").doc()
        await vendorInvoiceRef.set(invoice)
        const customerInvoiceRef = db.collection("users").doc(customerId).collection("invoices").doc(vendorInvoiceRef.id)
        await customerInvoiceRef.set(invoice)
        await db.collection("users").doc(customerId).collection("notifications").doc().set({
            type: "invoice",
            timestamp: serverTimestamp,
            sender: {
                id: vendorId,
                name: vendorData.name,
                photoURL: vendorData.photoURL
            },
            title: "Invoice received",
            message: `${vendorData.name} has sent you an invoice`,
            content: vendorInvoiceRef.id
        })
        await db.collection("users").doc(vendorId).update({
            ...vendorData,
            lastInvoice: vendorData.lastInvoice + 1
        })
        return res.status(200).json({
            status: "success",
            message: "invoice created succesfully"
        })
      } 
      catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.code
        })
      }
})

app.delete("/coinmo/invoice/:id", async(req, res) => {
    try{
        // Validate User Token
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        const decodedToken = await auth.verifyIdToken(token)

        // Delete Invoice
        await db.collection('users').doc(decodedToken.uid).collection('invoices').doc(req.params.id).delete()
        return res.status(200).json({
            status: "success",
            message: "invoice deleted succesfully"
        })
    }catch(error){
        return res.status(500).json({
            status: "error",
            message: error.code
        })
    }
})

app.post("/coinmo/validate/invoice/:id", async (req, res) => {
    try{
        const serverTimestamp = Date.now()
        const date = new Date(serverTimestamp)
        // Validate User Token
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        const decodedToken = await auth.verifyIdToken(token)

        // Get invoice information 
        const invoiceDoc = await db.collection('users').doc(decodedToken.uid).collection("invoices").doc(req.params.id).get()
        const invoiceData = invoiceDoc.data()
        
        // Check that state has never been changed
        if (!invoiceData.state === "pending"){
            throw new Error(`Invoice already been ${invoiceData.state}`)
        }

        // Update state
        await db.collection("users").doc(invoiceData.customer.id).collection("invoices").doc(req.params.id).update({state: "validated"})
        await db.collection("users").doc(invoiceData.vendor.id).collection("invoices").doc(req.params.id).update({state: "validated"})

        // Update vendor statistics
        const vendorStatisticsRef =  db.collection("users").doc(invoiceData.vendor.id).collection("statistics").doc(`${date.getMonth() + 1}-${date.getFullYear()}`)
        vendorStatisticsRef.get()
            .then((doc) => {
                if (doc.exists){
                    const data = doc.data()
                    vendorStatisticsRef.update({
                        sales: data.sales + invoiceData.total,
                    })
                }
                else{
                    vendorStatisticsRef.set({
                        sales: invoiceData.total,
                        expenses: 0,
                        expensesByCategory: {}
                    })
                }
            })

        // Update customer statistics
        const customerStatisticsRef = db.collection("users").doc(invoiceData.customer.id).collection("statistics").doc(`${date.getMonth() + 1}-${date.getFullYear()}`)
        customerStatisticsRef.get()
            .then((doc) => {
                if (doc.exists){
                    const data = doc.data()
                    if (data.expensesByCategory.hasOwnProperty(invoiceData.vendor.category)) {
                        data.expensesByCategory[invoiceData.vendor.category] += invoiceData.total;
                    } else {
                        data.expensesByCategory[invoiceData.vendor.category] = invoiceData.total;
                    }
                    data.expenses += invoiceData.total
                    customerStatisticsRef.update(data)
                }
                else{
                    customerStatisticsRef.set({
                        sales: 0,
                        expenses: invoiceData.total,
                        expensesByCategory: {[invoiceData.vendor.category]: invoiceData.total}
                    })
                }
            })

        // Notify vendor that state has changed
        await db.collection("users").doc(invoiceData.vendor.id).collection("notifications").doc().set({
            type: "validated",
            timestamp: serverTimestamp,
            sender: {
                id: invoiceData.customer.id,
                name: invoiceData.customer.name,
                photoURL: invoiceData.customer.photoURL
            },
            title: "Invoice validated",
            message: `${invoiceData.customer.name} validated your invoice`,
            content: req.params.id
        })
        return res.status(200).json({
            status: "success",
            message: "invoice validated succesfully"
        })
    }catch(error){
        return res.status(500).json({
            status: "error",
            message: error.code
        })
    }
})

app.post("/coinmo/decline/invoice/:id", async (req, res) => {
    try{
        // Validate User Token
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        const decodedToken = await auth.verifyIdToken(token)

        // Get invoice information 
        const invoiceDoc = await db.collection('users').doc(decodedToken.uid).collection("invoices").doc(req.params.id).get()
        const invoiceData = invoiceDoc.data()
        
        // Check that state has never been changed
        if (!invoiceData.state === "pending"){
            throw new Error(`Invoice already been ${invoiceData.state}`)
        }

        // Update vendors invoice state
        await db.collection("users").doc(invoiceData.vendor.id).collection("invoices").doc(req.params.id).update({state: "declined"})

        // Delete customers invoice
        await db.collection("users").doc(invoiceData.customer.id).collection("invoices").doc(req.params.id).delete()

        // Notify vendor that state has changed
        const serverTimestamp = Date.now()
        await db.collection("users").doc(invoiceData.vendor.id).collection("notifications").doc().set({
            type: "declined",
            timestamp: serverTimestamp,
            sender: {
                id: invoiceData.customer.id,
                name: invoiceData.customer.name,
                photoURL: invoiceData.customer.photoURL
            },
            title: "Invoice declined",
            message: `${invoiceData.customer.name} declined your invoice`,
            content: req.params.id
        })
        return res.status(200).json({
            status: "success",
            message: "invoice declines succesfully"
        })
    }catch(error){
        return res.status(500).json({
            status: "error",
            message: error.code
        })
    }
})

app.delete("/coinmo/notification/:id", async(req, res) => {
    try{
        // Validate User Token
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        const decodedToken = await auth.verifyIdToken(token)

        // Delete Notification
        await db.collection('users').doc(decodedToken.uid).collection('notifications').doc(req.params.id).delete()
        return res.status(200).json({
            status: "success",
            message: "notification deleted succesfully"
        })
    }catch(error){
        return res.status(500).json({
            status: "error",
            message: error.code
        })
    }
})

exports.app = onRequest(app);