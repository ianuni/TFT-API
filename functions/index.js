const {onRequest} = require('firebase-functions/v2/https');
const admin = require("firebase-admin")
const express = require('express')
const cors = require('cors')
const multer = require('multer')

// Multer Configuration
// Configuración de multer
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/'); // Carpeta donde se guardarán los archivos subidos
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname); // Utiliza el nombre original del archivo
    }
  });
  
const upload = multer({ fileStorage });


// Firebase Configuration
var serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'gs://coinmo-8a9cd.appspot.com'
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage()



//Main App
const app = express()


// Routes
app.post('/upload', upload.single('file'), (req, res) => {
    // Accede al archivo subido mediante req.file
    console.log('Archivo recibido:', req);
  
    // Realiza otras operaciones con el archivo
    // ...
  
    //res.send('Archivo recibido correctamente');
  });

app.post(('/coinmo/user/add'), async (req, res) => {
    let photoUrl = null
    let bucket = admin.storage().bucket()
    const file = bucket.file(`profilePictures/a.jpg`);
    console.log(req.body)
    //await file.save(req.body.data)

    /*
    const user = await auth.createUser({
        email: req.body.email,
        password: req.body.password
    })
    await db.collection("users")
        .doc(`/${user.uid}`)
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
            photoUrl: photoUrl
        });
    const querySnapshot = await db.collection('usersPublic').get()
    const number = "#" + querySnapshot.size.toString().padStart(4, '0');
    await db.collection("usersPublic")
        .doc(`/${user.uid}`)
        .create({
            name: req.body.name,
            code: number,
            category: req.body.category,
            description: req.body.description,
            photoUrl: photoUrl
        })
    //const image = bucket.file("profilePictures/GFNFGApbo0XlKcxa7PNQw3LBbHp1")
    //console.log(image);
    /*if(true){ 
        await bucket.upload(req.body.file, {
            destination: `profilePictures/${user.uid}`
          });
    }*/

    return res.status(200).json(req.body)
    
})

app.get(('/coinmo/user/:name'), async (req, res) => {
    
    try {
        let response  = []      
        const querySnapshot = await db.collection('usersPublic').get()
        querySnapshot.docs.forEach( (doc) => {
            if (doc.data().name.includes(req.params.name)){
                response.push({
                    id: doc.id,
                    ...doc.data()
                })
            } 
        })
        return res.status(200).json(response)
    } catch (error) {
        return res.status(500).json();
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
        console.log(error)
        return res.status(500).json()
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
            invoiceId: customerData.lastInvoice + 1,
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
        return res.status(200).json()
      } 
      catch (error) {
        console.log(error)
        return res.status(500).json()
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
        return res.status(200).json()
    }catch(error){
        return res.status(500).json()
    }
})

app.post("/coinmo/validate/invoice/:id", async (req, res) => {
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

        // Update state
        await db.collection("users").doc(invoiceData.customer.id).collection("invoices").doc(req.params.id).update({state: "validated"})
        await db.collection("users").doc(invoiceData.vendor.id).collection("invoices").doc(req.params.id).update({state: "validated"})

        // Notify vendor that state has changed
        const serverTimestamp = Date.now()
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
        return res.status(200).json()
    }catch(error){
        return res.status(500).json()
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

        // Update state
        await db.collection("users").doc(invoiceData.customer.id).collection("invoices").doc(req.params.id).update({state: "declined"})
        await db.collection("users").doc(invoiceData.vendor.id).collection("invoices").doc(req.params.id).update({state: "declined"})

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
        return res.status(200).json()
    }catch(error){
        return res.status(500).json()
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
        return res.status(200).json()
    }catch(error){
        return res.status(500).json()
    }
})




exports.app = onRequest(app);

