require('dotenv').config()

const AWS = require('aws-sdk')
const axios = require('axios')
const cron = require('node-cron')
const schedule = require('node-schedule')
const shell = require('shelljs')
const xlsx = require('node-xlsx')
const fs = require('fs')

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_BUCKET_REGION,
})

const s3 = new AWS.S3()

const unatecData = async () => {
  try {
    const authData = await axios.post(
      `${process.env.UNATEC_ENDPOINT}/connect/token`,
      `username=${process.env.UNATEC_USERNAME}&password=${process.env.UNATEC_PASSWORD}&client_id=${process.env.UNATEC_CLIENTID}&scope=energy.commons.api offline_access&grant_type=password`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    )

    // authData.data = {
    //  access_token: String,
    //  expires_in: Int === seconds,
    //  token_type: String === 'Bearer',
    //  refresh_token: String, 
    //  scope: String === 'energy.commons.api offline_access'
    // }

    const token = authData?.data?.access_token
  
    const tags = xlsx.parse(__dirname + '/tags.xlsx')
    const parsedTags = tags[0].data.map(([ tag, description, unit ]) => tag).filter(tag => tag)
  
    const signalsData = await Promise.all(
      parsedTags.map(
        async tag => await axios.get(
          `${process.env.PI_API_ENDPOINT}/signals/${tag}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
      )
    )

    // signalsData: [
      // {
      //   data: {
      //     id: String,
      //     tag: String === 'COV:CovaDaSerpe.Cov11.Meteorological.WindDirection',
      //     name: String === 'PE Cova da Serpe 11 V80 - Meteorological Wind Direction',
      //     unit: String === 'grad' || 'm/s',
      //     startDate: ISO String,
      //     interval: Int === seconds,
      //     isScalar: Bool,
      //     facilities: [],
      //     bdiElements: [],
      //     created: ISO String,
      //     lastModified: ISO String,,
      //     deletedDate: null,
      //     lastModifiedUser: String
      //   },
      //   ...
      // }
    // ]

    const measuresData = await Promise.all(
      signalsData.map(
        async ({ data }) => data.id && await axios.get(
          `${process.env.PI_API_ENDPOINT}/measures/${data.id}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )
      )
    )

    // measuresData: [
    //   measure: {
    //     data: {
    //       UniqueId: String,
    //       signalId: String,
    //       date: ISO 8601 String,
    //       value: Float,
    //       stringValue: '${data.value} ${'grad' || 'm/s'}'
    //     },
    //      ...
    //   },
    //   ...
    // ]

    return measuresData?.map(measure => measure?.data).filter(measure => measure)

  } catch (error) {
    console.log(error)
  }
}

const powerbiData = async () => {

  const credentials = {
    auth: {
      username: process.env.POWERBI_USERNAME,
      password: process.env.POWERBI_PASSWORD,
    }
  }

  const now = new Date()
  const end = now.toISOString()
  const start = new Date(now.setHours(now.getHours() - 3)).toISOString() // replace the 3 with the amount of hours between cron jobs

  try {
    const installationData = await axios.get(
      `${process.env.POWERBI_ENDPOINT}/instalacion`,
      credentials,
    )

    const productionData = await Promise.all(
      installationData.data.map(
        async ({ Codigo }) => await axios.get(
          `${process.env.POWERBI_ENDPOINT}/instalacion/${Codigo}/produccion?desde=${start}&hasta=${end}`,
          credentials,
        )
      )
    )

    const availabilityData = await Promise.all(
      installationData.data.map(
        async ({ Codigo }) => await axios.get(
          `${process.env.POWERBI_ENDPOINT}/instalacion/${Codigo}/disponibilidadmaquina?desde=${start}&hasta=${end}`,
          credentials,
        )
      )
    )
    
    return {
      production: productionData.map(production => production.data),
      availability: availabilityData.map(production => production.data),
    }

  } catch (error) {
    console.log(error)
  }
}

const readValues = async () => {
  try {

    const data = {
      unatec: await unatecData(),
      powerbi: await powerbiData(),
    }
    
    const dataTargets = [
      'naturgyCurrentData.json',
      `archive/naturgy-${new Date().toISOString().slice(0, 16)}.json`,
    ]
    
    data.unatec && data.powerbi && dataTargets.forEach(
      async target => await s3.upload(
        {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: target,
          Body: JSON.stringify(data),
          ContentType: "application/json",
          ACL:'public-read',
        },
        (err, data) => {
          if (err) throw Error
          console.log(`Data Updated Succesfully. ${data.Location}`)
        }
      ).promise()
    )
    
  } catch (error) {
    console.log(error)
  }
}

cron.schedule('* * * * *', async () => await readValues())
// cron.schedule('0 0 */3 * * *', async () => await readValues())

schedule.scheduleJob('45 5,12,17 * * *', () => {
  const response = shell.exec('./ecmwf/HRES_ECMWF_extraccion_continuo.sh');
  if (response.code === 0) {
    const conversion = shell.exec(`grib_to_netcdf -o ./ecmwf/output.nc ./ecmwf/input.grib`)

    if (conversion.code === 0) {
      const fileStream = fs.createReadStream('./ecmwf/output.nc')
      fileStream.on('error', err => console.log('File Error: ', err))

      s3.upload({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: 'ecmwfCurrentData.nc',
        Body: fileStream,
      }, (err, data) => {
        if (err) throw Error
        console.log(`Data Updated Succesfully. ${data.Location}`)
      })
    }
  }
})